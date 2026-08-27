import { headers } from 'next/headers'
import { getDb } from '@/db'
import { config as configTable, state as stateTable } from '@/db/schema'
import Dashboard from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  let initialConfig = null
  let initialState = null

  // User set by middleware via headers
  const hdrs = await headers()
  const user = {
    email: hdrs.get('x-pi-email') ?? '',
    name:  hdrs.get('x-pi-name') ?? '',
    picture: hdrs.get('x-pi-picture') ?? '',
  }

  try {
    const db = getDb()
    const [cfg] = await db.select().from(configTable).limit(1)
    const [st] = await db.select().from(stateTable).limit(1)
    initialConfig = cfg ?? null
    initialState = st
      ? {
          lastRunAt: st.lastRunAt?.toISOString() ?? null,
          lastFoundCount: st.lastFoundCount,
          lastPostDate: st.lastPostDate ?? null,
        }
      : null
  } catch {
    // DB not ready yet — show dashboard with defaults
  }

  return (
    <Dashboard
      user={user}
      initialConfig={
        initialConfig
          ? {
              categoryDepts: initialConfig.categoryDepts as number[],
              categoryLevels: initialConfig.categoryLevels as number[],
              searchString: initialConfig.searchString ?? '',
              emailTo: initialConfig.emailTo ?? '',
              scheduleCron: initialConfig.scheduleCron ?? '0 10 * * *',
              isActive: initialConfig.isActive ?? true,
            }
          : null
      }
      initialState={initialState}
    />
  )
}
