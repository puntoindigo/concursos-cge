import { NextResponse } from 'next/server'
import { getDb } from '@/db'
import { runHistory, userQueryLog } from '@/db/schema'
import { getUser } from '@/lib/get-user'
import { desc } from 'drizzle-orm'

const SUPERADMIN = 'daeiman@gmail.com'

export async function GET() {
  const auth = await getUser()
  if (!auth.ok || auth.user.email !== SUPERADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const [runs, queries] = await Promise.all([
    db.select().from(runHistory).orderBy(desc(runHistory.ranAt)).limit(100),
    db.select().from(userQueryLog).orderBy(desc(userQueryLog.queriedAt)).limit(200),
  ])

  return NextResponse.json({ runs, queries })
}
