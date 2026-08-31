import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db'
import { config as configTable, state as stateTable } from '@/db/schema'
import { getUser } from '@/lib/get-user'
import { notifyError } from '@/lib/error-notify'

export async function GET() {
  let userEmail: string | undefined
  try {
    const auth = await getUser()
    if (auth.ok) userEmail = auth.user.email
  } catch {}

  try {
    const db = getDb()
    const [cfg] = await db.select().from(configTable).limit(1)
    const [st] = await db.select().from(stateTable).limit(1)
    return NextResponse.json({ config: cfg ?? null, state: st ?? null })
  } catch (e) {
    await notifyError({ endpoint: 'GET /api/config', error: e, userEmail })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let userEmail: string | undefined
  try {
    const auth = await getUser()
    if (auth.ok) userEmail = auth.user.email
  } catch {}

  try {
    const body = await req.json()
    const db = getDb()

    await db
      .insert(configTable)
      .values({
        id: 1,
        categoryDepts: body.categoryDepts ?? [45],
        categoryLevels: body.categoryLevels ?? [151],
        searchString: body.searchString ?? '',
        emailTo: body.emailTo ?? '',
        scheduleCron: body.scheduleCron ?? '0 10 * * *',
        isActive: body.isActive ?? true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: configTable.id,
        set: {
          categoryDepts: body.categoryDepts ?? [45],
          categoryLevels: body.categoryLevels ?? [151],
          searchString: body.searchString ?? '',
          emailTo: body.emailTo ?? '',
          scheduleCron: body.scheduleCron ?? '0 10 * * *',
          isActive: body.isActive ?? true,
          updatedAt: new Date(),
        },
      })

    return NextResponse.json({ ok: true })
  } catch (e) {
    await notifyError({ endpoint: 'POST /api/config', error: e, userEmail })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
