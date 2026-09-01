import { NextRequest, NextResponse, after as scheduleAfter } from 'next/server'
import { getDb } from '@/db'
import { cachedPosts, state as stateTable } from '@/db/schema'
import { and, gt, desc } from 'drizzle-orm'
import { decodeHtml, removeAccents } from '@/lib/fetcher'
import { getUser } from '@/lib/get-user'
import { notifyError } from '@/lib/error-notify'

const STALE_MS = 30 * 60 * 1000 // 30 minutes

const GITHUB_REPO = 'puntoindigo/concursos-cge'
const WORKFLOW_FILE = 'refresh-cache.yml'

async function dispatchRefreshWorkflow() {
  const token = process.env.GITHUB_PAT
  if (!token) return
  try {
    await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    )
  } catch {}
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const depts = sp.get('depts')?.split(',').map(Number).filter(Boolean) ?? []
  const levels = sp.get('levels')?.split(',').map(Number).filter(Boolean) ?? []
  const search = sp.get('search') ?? ''
  const afterDays = parseInt(sp.get('afterDays') ?? '0')

  let after: Date | undefined
  if (afterDays > 0) {
    const d = new Date()
    const daysBack = afterDays === 1 ? 0 : afterDays
    d.setDate(d.getDate() - daysBack)
    d.setHours(0, 0, 0, 0)
    after = d
  }

  try {
    const db = getDb()

    // Read state and posts in parallel
    const [rows, [st]] = await Promise.all([
      db.select()
        .from(cachedPosts)
        .where(after ? and(gt(cachedPosts.date, after)) : undefined)
        .orderBy(desc(cachedPosts.date)),
      db.select().from(stateTable).limit(1),
    ])

    // Stale-while-revalidate: if cache hasn't been refreshed in 30 min (or is empty),
    // trigger a background refresh — user still gets the current cached response immediately
    const lastRunAt = st?.lastRunAt
    const isStale = !lastRunAt || Date.now() - lastRunAt.getTime() > STALE_MS
    if (isStale) {
      scheduleAfter(() => dispatchRefreshWorkflow())
    }

    // Map to the WpPost shape the Dashboard expects
    let posts = rows.map((r) => ({
      id: r.wpId,
      date: r.date.toISOString(),
      title: { rendered: r.title },
      link: r.link,
      excerpt: { rendered: r.excerpt },
      categories: r.categories as number[],
    }))

    // Category AND filter
    if (depts.length && levels.length) {
      posts = posts.filter(
        (p) =>
          depts.some((id) => p.categories.includes(id)) &&
          levels.some((id) => p.categories.includes(id))
      )
    } else if (depts.length) {
      posts = posts.filter((p) => depts.some((id) => p.categories.includes(id)))
    } else if (levels.length) {
      posts = posts.filter((p) => levels.some((id) => p.categories.includes(id)))
    }

    // Accent-insensitive text search
    if (search.trim()) {
      const tokens = removeAccents(search.trim().toLowerCase()).split(/\s+/).filter(Boolean)
      posts = posts.filter((p) => {
        const haystack =
          removeAccents(decodeHtml(p.title.rendered).toLowerCase()) +
          ' ' +
          removeAccents(decodeHtml(p.excerpt.rendered).toLowerCase())
        return tokens.every((tok) => haystack.includes(tok))
      })
    }

    return NextResponse.json({
      posts,
      total: posts.length,
      totalPages: 1,
      lastRunAt: lastRunAt?.toISOString() ?? null,
      isRefreshing: isStale,
      wpApiDown: st?.wpApiDown ?? false,
    })
  } catch (e) {
    let userEmail: string | undefined
    try {
      const auth = await getUser()
      if (auth.ok) userEmail = auth.user.email
    } catch {}
    await notifyError({
      endpoint: 'GET /api/posts',
      error: e,
      userEmail,
      extra: { depts, levels, search, afterDays },
    })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
