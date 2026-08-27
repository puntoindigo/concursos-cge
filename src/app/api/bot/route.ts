import { NextRequest, NextResponse } from 'next/server'
import { runBot } from '@/lib/bot'
import { verifySmtp } from '@/lib/mailer'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const forceEmail = body.forceEmail === true

  try {
    const result = await runBot(forceEmail)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  if (action === 'verify-smtp') {
    const result = await verifySmtp()
    return NextResponse.json(result)
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
