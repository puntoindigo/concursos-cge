import { redirect } from 'next/navigation'
import { getDb } from '@/db'
import { config as configTable, state as stateTable } from '@/db/schema'
import { getUser } from '@/lib/get-user'
import Dashboard from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const auth = await getUser()

  if (!auth.ok) {
    if (auth.reason === 'no_cookie' || auth.reason === 'invalid_token') {
      redirect('https://accounts.puntoindigo.com/api/auth/signin-google?next=' +
        encodeURIComponent(process.env.APP_URL ?? 'https://concursos-cge.puntoindigo.com'))
    }
    // not_allowed
    return (
      <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '80px 24px' }}>
        <h2 style={{ color: '#374151' }}>Acceso no autorizado</h2>
        <p style={{ color: '#6b7280' }}>
          Tu cuenta ({auth.reason}) no tiene acceso a esta aplicación.
        </p>
        <a href="https://accounts.puntoindigo.com/api/auth/logout"
           style={{ color: '#4f46e5' }}>
          Cerrar sesión
        </a>
      </div>
    )
  }

  const user = {
    email: auth.user.email,
    name: auth.user.name ?? '',
    picture: auth.user.picture ?? '',
    isSuperadmin: auth.user.email.toLowerCase() === 'daeiman@gmail.com',
  }

  let initialConfig = null
  let initialState = null

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
