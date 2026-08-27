import { getDb } from '@/db'
import { config as configTable, state as stateTable, runHistory } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { fetchConcursos } from './fetcher'
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

  // Fetch posts newer than the last one we saw
  const { posts } = await fetchConcursos({
    categoryDepts: cfg.categoryDepts as number[],
    categoryLevels: cfg.categoryLevels as number[],
    searchString: cfg.searchString ?? '',
    after: st?.lastPostDate ?? undefined,
    perPage: 100,
  })

  const now = new Date()
  let emailSent = false
  let errorMsg: string | undefined

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
