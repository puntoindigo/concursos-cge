import { NextRequest, NextResponse } from 'next/server'
import { fetchConcursos, type WpPost } from '@/lib/fetcher'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const depts = sp.get('depts')?.split(',').map(Number).filter(Boolean) ?? []
  const levels = sp.get('levels')?.split(',').map(Number).filter(Boolean) ?? []
  const search = sp.get('search') ?? ''
  const afterDays = parseInt(sp.get('afterDays') ?? '0')

  let after: string | undefined
  if (afterDays > 0) {
    const d = new Date()
    // afterDays=1 → "Hoy" → subtract 0 days (today midnight)
    // afterDays=7/15/30 → subtract N days
    const daysBack = afterDays === 1 ? 0 : afterDays
    d.setDate(d.getDate() - daysBack)
    d.setHours(0, 0, 0, 0)
    after = d.toISOString()
  }

  const baseOpts = {
    categoryDepts: depts,
    categoryLevels: levels,
    searchString: search,
    after,
    perPage: 30,
  }

  try {
    // Always aggregate up to 5 WP pages in parallel.
    // Reasons:
    //   1. WP `categories` filter is OR; we need AND → client-side filter drops most results
    //      per page, so we must look across multiple pages to find all matches.
    //   2. WP `search` is not used (accent issues), so all text filtering is client-side —
    //      same problem: many WP posts per page may be filtered out.
    // Result: always return totalPages=1 → no spurious "Ver más" button.
    const firstResult = await fetchConcursos({ ...baseOpts, page: 1 })
    const allPosts: WpPost[] = [...firstResult.posts]

    const maxWpPages = Math.min(firstResult.totalPages, 5)
    if (maxWpPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: maxWpPages - 1 }, (_, i) =>
          fetchConcursos({ ...baseOpts, page: i + 2 })
        )
      )
      rest.forEach((r) => allPosts.push(...r.posts))
    }

    return NextResponse.json({ posts: allPosts, total: allPosts.length, totalPages: 1 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
