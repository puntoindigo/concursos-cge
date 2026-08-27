import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db'
import { config as configTable, state as stateTable } from '@/db/schema'

export async function GET() {
  const db = getDb()
  const [cfg] = await db.select().from(configTable).limit(1)
  const [st] = await db.select().from(stateTable).limit(1)
  return NextResponse.json({ config: cfg ?? null, state: st ?? null })
}

export async function POST(req: NextRequest) {
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
}
