import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const numId = parseInt(id)
  if (!numId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const res = await fetch(
    `https://cge.entrerios.gov.ar/wp-json/wp/v2/posts/${numId}?_fields=id,content`,
    {
      headers: { 'User-Agent': 'ConcursosCGEBot/1.0 (+https://puntoindigo.com)' },
      cache: 'no-store',
    }
  )

  if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: res.status })
  const data = await res.json()
  return NextResponse.json({ content: data.content?.rendered ?? '' })
}
