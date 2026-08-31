import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db'
import { cachedPosts } from '@/db/schema'
import { and, gt, desc } from 'drizzle-orm'
import { decodeHtml, removeAccents } from '@/lib/fetcher'
import { getUser } from '@/lib/get-user'
import { notifyError } from '@/lib/error-notify'

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

    const rows = await db
      .select()
      .from(cachedPosts)
      .where(after ? and(gt(cachedPosts.date, after)) : undefined)
      .orderBy(desc(cachedPosts.date))

    // Map to the WpPost shape the Dashboard expects
    let posts = rows.map((r) => ({
      id: r.wpId,
      date: r.date.toISOString(),
      title: { rendered: r.title },
      link: r.link,
      excerpt: { rendered: r.excerpt },
      categories: r.categories as number[],
    }))

    // Category AND filter (same logic as fetcher.ts)
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

    // Accent-insensitive text search across title + excerpt
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

    return NextResponse.json({ posts, total: posts.length, totalPages: 1 })
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
