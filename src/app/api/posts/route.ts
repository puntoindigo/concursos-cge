import { NextRequest, NextResponse } from 'next/server'
import { fetchConcursos, type WpPost } from '@/lib/fetcher'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const depts = sp.get('depts')?.split(',').map(Number).filter(Boolean) ?? []
  const levels = sp.get('levels')?.split(',').map(Number).filter(Boolean) ?? []
  const search = sp.get('search') ?? ''
  const page = parseInt(sp.get('page') ?? '1')
  const afterDays = parseInt(sp.get('afterDays') ?? '0')

  let after: string | undefined
  if (afterDays > 0) {
    const d = new Date()
    d.setDate(d.getDate() - afterDays)
    d.setHours(0, 0, 0, 0)
    after = d.toISOString()
  }

  const baseOpts = { categoryDepts: depts, categoryLevels: levels, searchString: search, after, perPage: 30 }

  try {
    // When search string is active, collect ALL title/excerpt matches across WP pages.
    // WP's own `search` param matches full post body (too broad), so we paginate WP
    // server-side and our client-side filter in fetcher.ts keeps only title/excerpt hits.
    if (search.trim()) {
      const firstResult = await fetchConcursos({ ...baseOpts, page: 1 })
      const allPosts: WpPost[] = [...firstResult.posts]

      const wpPages = Math.min(firstResult.totalPages, 6) // cap at 6 WP pages
      if (wpPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: wpPages - 1 }, (_, i) =>
            fetchConcursos({ ...baseOpts, page: i + 2 })
          )
        )
        rest.forEach((r) => allPosts.push(...r.posts))
      }

      return NextResponse.json({ posts: allPosts, total: allPosts.length, totalPages: 1 })
    }

    // No search: normal single-page fetch with client-controlled pagination
    const result = await fetchConcursos({ ...baseOpts, page })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
