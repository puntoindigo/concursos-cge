import { NextRequest, NextResponse } from 'next/server'
import { fetchConcursos } from '@/lib/fetcher'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const depts = sp.get('depts')?.split(',').map(Number).filter(Boolean) ?? []
  const levels = sp.get('levels')?.split(',').map(Number).filter(Boolean) ?? []
  const search = sp.get('search') ?? ''
  const page = parseInt(sp.get('page') ?? '1')

  try {
    const result = await fetchConcursos({
      categoryDepts: depts,
      categoryLevels: levels,
      searchString: search,
      perPage: 30,
      page,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
