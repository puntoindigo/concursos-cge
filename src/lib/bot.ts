import { getDb } from '@/db'
import { config as configTable, state as stateTable, runHistory, cachedPosts } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { fetchConcursos, type WpPost } from './fetcher'
import { sendConcursosEmail } from './mailer'

export interface BotRunResult {
  postsFound: number
  emailSent: boolean
  error?: string
}

export async function runBot(forceEmailEvenIfEmpty = false): Promise<BotRunResult> {
  const db = getDb()

  // Load config and state
  const [cfg] = await db.select().from(configTable).limit(1)
  if (!cfg) return { postsFound: 0, emailSent: false, error: 'No config found' }

  const [st] = await db.select().from(stateTable).limit(1)

  // Fetch all posts (no `after` filter — we cache everything for the dashboard)
  // 25s timeout: this runs in background via after() so has more headroom
  const fetchOpts = {
    categoryDepts: cfg.categoryDepts as number[],
    categoryLevels: cfg.categoryLevels as number[],
    searchString: cfg.searchString ?? '',
    perPage: 100,
    timeoutMs: 25000,
  }
  const firstPage = await fetchConcursos({ ...fetchOpts, page: 1 })
  const allPosts: WpPost[] = [...firstPage.posts]
  const maxPages = Math.min(firstPage.totalPages, 10)
  if (maxPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: maxPages - 1 }, (_, i) =>
        fetchConcursos({ ...fetchOpts, page: i + 2 })
      )
    )
    rest.forEach((r) => allPosts.push(...r.posts))
  }
  const posts = allPosts

  const now = new Date()
  let emailSent = false
  let errorMsg: string | undefined

  // Persist fetched posts to cache so the dashboard can read from DB (fast)
  if (posts.length > 0) {
    await db
      .insert(cachedPosts)
      .values(
        posts.map((p) => ({
          wpId: p.id,
          date: new Date(p.date),
          title: p.title.rendered,
          link: p.link,
          excerpt: p.excerpt.rendered,
          categories: p.categories,
          cachedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: cachedPosts.wpId,
        set: {
          date: sql`excluded.date`,
          title: sql`excluded.title`,
          link: sql`excluded.link`,
          excerpt: sql`excluded.excerpt`,
          categories: sql`excluded.categories`,
          cachedAt: sql`excluded.cached_at`,
        },
      })
  }

  if (posts.length > 0 || forceEmailEvenIfEmpty) {
    if (posts.length > 0 && cfg.emailTo) {
      try {
        await sendConcursosEmail(
          posts,
          cfg.emailTo,
          cfg.categoryDepts as number[],
          cfg.categoryLevels as number[]
        )
        emailSent = true
      } catch (e) {
        errorMsg = String(e)
      }
    }

    // Update state to most recent post
    const newest = posts[0]
    await db
      .insert(stateTable)
      .values({
        id: 1,
        lastRunAt: now,
        lastPostDate: newest?.date ?? st?.lastPostDate,
        lastPostId: newest?.id ?? st?.lastPostId,
        lastFoundCount: posts.length,
      })
      .onConflictDoUpdate({
        target: stateTable.id,
        set: {
          lastRunAt: now,
          lastPostDate: newest?.date ?? st?.lastPostDate,
          lastPostId: newest?.id ?? st?.lastPostId,
          lastFoundCount: posts.length,
        },
      })

    // Log to history
    await db.insert(runHistory).values({
      ranAt: now,
      postsFound: posts.length,
      emailSent,
      emailTo: cfg.emailTo,
      postsData: posts.map((p) => ({
        id: p.id,
        title: p.title.rendered,
        link: p.link,
        date: p.date,
      })),
    })
  } else {
    // No new posts — still update lastRunAt
    await db
      .insert(stateTable)
      .values({ id: 1, lastRunAt: now, lastFoundCount: 0 })
      .onConflictDoUpdate({
        target: stateTable.id,
        set: { lastRunAt: now, lastFoundCount: 0 },
      })
  }

  return { postsFound: posts.length, emailSent, error: errorMsg }
}
