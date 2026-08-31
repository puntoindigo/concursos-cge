import { NextRequest, NextResponse } from 'next/server'
import { runBot } from '@/lib/bot'
import { verifySmtp } from '@/lib/mailer'
import { getUser } from '@/lib/get-user'
import { notifyError } from '@/lib/error-notify'

// Called by Vercel Cron (GET) or manually from dashboard (POST)
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'verify-smtp') {
    const result = await verifySmtp()
    return NextResponse.json(result)
  }

  // Vercel Cron invocation — protected by Authorization header
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runBot()
    return NextResponse.json(result)
  } catch (e) {
    await notifyError({ endpoint: 'GET /api/bot (cron)', error: e })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const forceEmail = body.forceEmail === true

  try {
    const result = await runBot(forceEmail)
    return NextResponse.json(result)
  } catch (e) {
    let userEmail: string | undefined
    try {
      const auth = await getUser()
      if (auth.ok) userEmail = auth.user.email
    } catch {}
    await notifyError({ endpoint: 'POST /api/bot', error: e, userEmail })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
