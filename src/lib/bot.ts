import { getDb } from '@/db'
import { config as configTable, state as stateTable, runHistory, cachedPosts } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { fetchConcursos, type WpPost } from './fetcher'
import { sendConcursosEmail } from './mailer'

export interface BotRunResult {
  postsFound: number
  emailSent: boolean
  wpApiDown: boolean
  error?: string
}

export async function runBot(forceEmailEvenIfEmpty = false): Promise<BotRunResult> {
  const db = getDb()

  const [cfg] = await db.select().from(configTable).limit(1)
  if (!cfg) return { postsFound: 0, emailSent: false, wpApiDown: false, error: 'No config found' }

  const [st] = await db.select().from(stateTable).limit(1)

  const fetchOpts = {
    categoryDepts: cfg.categoryDepts as number[],
    categoryLevels: cfg.categoryLevels as number[],
    searchString: cfg.searchString ?? '',
    perPage: 100,
    timeoutMs: 25000,
  }

  const now = new Date()
  let posts: WpPost[] = []
  let wpApiDown = false
  let errorMsg: string | undefined

  try {
    const firstPage = await fetchConcursos({ ...fetchOpts, page: 1 })
    posts = [...firstPage.posts]
    const maxPages = Math.min(firstPage.totalPages, 10)
    if (maxPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: maxPages - 1 }, (_, i) =>
          fetchConcursos({ ...fetchOpts, page: i + 2 })
        )
      )
      rest.forEach((r) => posts.push(...r.posts))
    }
  } catch (e) {
    wpApiDown = true
    errorMsg = String(e)
  }

  // Always update state with lastRunAt and wpApiDown
  await db
    .insert(stateTable)
    .values({
      id: 1,
      lastRunAt: now,
      wpApiDown,
      lastFoundCount: wpApiDown ? (st?.lastFoundCount ?? 0) : posts.length,
      lastPostDate: wpApiDown ? st?.lastPostDate : (posts[0]?.date ?? st?.lastPostDate),
      lastPostId: wpApiDown ? st?.lastPostId : (posts[0]?.id ?? st?.lastPostId),
    })
    .onConflictDoUpdate({
      target: stateTable.id,
      set: {
        lastRunAt: now,
        wpApiDown,
        lastFoundCount: wpApiDown ? sql`state.last_found_count` : posts.length,
        lastPostDate: wpApiDown
          ? sql`state.last_post_date`
          : (posts[0]?.date ?? st?.lastPostDate ?? sql`state.last_post_date`),
        lastPostId: wpApiDown
          ? sql`state.last_post_id`
          : (posts[0]?.id ?? st?.lastPostId ?? sql`state.last_post_id`),
      },
    })

  let emailSent = false

  if (!wpApiDown) {
    // Persist fetched posts to cache
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

    if ((posts.length > 0 || forceEmailEvenIfEmpty) && cfg.emailTo && posts.length > 0) {
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
  }

  // Always log to history (including API-down runs)
  await db.insert(runHistory).values({
    ranAt: now,
    postsFound: posts.length,
    emailSent,
    emailTo: cfg.emailTo,
    wpApiDown,
    postsData: posts.map((p) => ({
      id: p.id,
      title: p.title.rendered,
      link: p.link,
      date: p.date,
    })),
  })

  return { postsFound: posts.length, emailSent, wpApiDown, error: errorMsg }
}
