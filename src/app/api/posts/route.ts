import { NextRequest, NextResponse } from 'next/server'
import { fetchConcursos } from '@/lib/fetcher'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const depts = sp.get('depts')?.split(',').map(Number).filter(Boolean) ?? []
  const levels = sp.get('levels')?.split(',').map(Number).filter(Boolean) ?? []
  const search = sp.get('search') ?? ''
  const page = parseInt(sp.get('page') ?? '1')
  const afterDays = parseInt(sp.get('afterDays') ?? '0')

  // Convert days to ISO date string for the WP API `after` parameter
  let after: string | undefined
  if (afterDays > 0) {
    const d = new Date()
    d.setDate(d.getDate() - afterDays)
    d.setHours(0, 0, 0, 0)
    after = d.toISOString()
  }

  try {
    const result = await fetchConcursos({
      categoryDepts: depts,
      categoryLevels: levels,
      searchString: search,
      after,
      perPage: 30,
      page,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
