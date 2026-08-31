import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/get-user'
import { notifyError } from '@/lib/error-notify'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let userEmail: string | undefined
  try {
    const auth = await getUser()
    if (auth.ok) userEmail = auth.user.email
  } catch {}

  const { id } = await params
  const numId = parseInt(id)
  if (!numId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://cge.entrerios.gov.ar/wp-json/wp/v2/posts/${numId}?_fields=id,content`,
      {
        headers: { 'User-Agent': 'ConcursosCGEBot/1.0 (+https://puntoindigo.com)' },
        cache: 'no-store',
        signal: controller.signal,
      }
    )
    clearTimeout(timer)

    if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: res.status })
    const data = await res.json()
    return NextResponse.json({ content: data.content?.rendered ?? '' })
  } catch (e) {
    await notifyError({ endpoint: `GET /api/post/${numId}`, error: e, userEmail })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
