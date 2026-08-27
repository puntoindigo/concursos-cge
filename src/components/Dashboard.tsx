'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DEPARTMENTS, LEVELS, CATEGORY_NAME } from '@/lib/categories'

interface User {
  email: string
  name: string
  picture: string
}

interface WpPost {
  id: number
  date: string
  title: { rendered: string }
  link: string
  excerpt: { rendered: string }
  categories: number[]
}

interface Config {
  categoryDepts: number[]
  categoryLevels: number[]
  searchString: string
  emailTo: string
  scheduleCron: string
  isActive: boolean
}

interface AppState {
  lastRunAt: string | null
  lastFoundCount: number
  lastPostDate: string | null
}

function decodeHtml(html: string) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function levelBadge(categoryIds: number[]) {
  const levels = [149, 150, 151, 152, 208]
  const found = categoryIds.filter((id) => levels.includes(id))
  const depts = [45, 26, 29, 30, 33, 59, 34, 37, 39, 57, 41, 43]
  const foundDepts = categoryIds.filter((id) => depts.includes(id))
  return { levels: found, depts: foundDepts }
}

function cronToHumanART(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length < 2) return cron
  const minUTC = parseInt(parts[0])
  const hourUTC = parseInt(parts[1])
  if (isNaN(hourUTC)) return cron
  const hourART = (hourUTC - 3 + 24) % 24
  return `${String(hourART).padStart(2, '0')}:${String(minUTC).padStart(2, '0')} (hora Argentina)`
}

export default function Dashboard({
  user,
  initialConfig,
  initialState,
}: {
  user: User
  initialConfig: Config | null
  initialState: AppState | null
}) {
  const defaultConfig: Config = {
    categoryDepts: [45],
    categoryLevels: [151],
    searchString: '',
    emailTo: '',
    scheduleCron: '0 10 * * *',
    isActive: true,
  }

  const [cfg, setCfg] = useState<Config>(initialConfig ?? defaultConfig)
  const [appState, setAppState] = useState<AppState | null>(initialState)
  const [posts, setPosts] = useState<WpPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [botRunning, setBotRunning] = useState(false)
  const [botMsg, setBotMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'results' | 'settings'>('results')
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fire login notification once per browser session
  useEffect(() => {
    if (!user.email) return
    const key = `cge_notified_${user.email}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    fetch('/api/auth/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, name: user.name }),
    }).catch(() => {})
  }, [user.email, user.name])

  const fetchPosts = useCallback(async (c: Config, p: number) => {
    if (!c.categoryDepts.length && !c.categoryLevels.length) {
      setPosts([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const sp = new URLSearchParams({
        depts: c.categoryDepts.join(','),
        levels: c.categoryLevels.join(','),
        search: c.searchString,
        page: String(p),
      })
      const res = await fetch(`/api/posts?${sp}`)
      const data = await res.json()
      if (p === 1) {
        setPosts(data.posts ?? [])
      } else {
        setPosts((prev) => [...prev, ...(data.posts ?? [])])
      }
      setTotal(data.total ?? 0)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced fetch when config changes
  useEffect(() => {
    setPage(1)
    if (fetchTimer.current) clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(() => fetchPosts(cfg, 1), 500)
    return () => { if (fetchTimer.current) clearTimeout(fetchTimer.current) }
  }, [cfg.categoryDepts, cfg.categoryLevels, cfg.searchString, fetchPosts])

  // Load more
  useEffect(() => {
    if (page > 1) fetchPosts(cfg, page)
  }, [page, fetchPosts, cfg])

  function toggleDept(id: number) {
    setCfg((c) => ({
      ...c,
      categoryDepts: c.categoryDepts.includes(id)
        ? c.categoryDepts.filter((x) => x !== id)
        : [...c.categoryDepts, id],
    }))
  }

  function toggleLevel(id: number) {
    setCfg((c) => ({
      ...c,
      categoryLevels: c.categoryLevels.includes(id)
        ? c.categoryLevels.filter((x) => x !== id)
        : [...c.categoryLevels, id],
    }))
  }

  async function saveConfig() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      const data = await res.json()
      setSaveMsg(data.ok ? '✓ Configuración guardada' : 'Error al guardar')
    } catch {
      setSaveMsg('Error al guardar')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  async function runBotNow(forceEmail = false) {
    setBotRunning(true)
    setBotMsg(null)
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceEmail }),
      })
      const data = await res.json()
      if (data.error) {
        setBotMsg(`Error: ${data.error}`)
      } else {
        const emailPart = data.emailSent ? ' · Email enviado ✓' : data.postsFound > 0 ? ' · Email no enviado' : ''
        setBotMsg(`${data.postsFound} post${data.postsFound !== 1 ? 's' : ''} nuevo${data.postsFound !== 1 ? 's' : ''}${emailPart}`)
        // Refresh state
        const stateRes = await fetch('/api/config')
        const stateData = await stateRes.json()
        if (stateData.state) setAppState(stateData.state)
      }
    } catch (e) {
      setBotMsg(`Error: ${String(e)}`)
    } finally {
      setBotRunning(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header style={{ background: 'linear-gradient(135deg,#4338ca 0%,#6366f1 100%)' }} className="px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-0.5">
            Consejo General de Educación · Entre Ríos
          </p>
          <h1 className="text-white text-xl font-bold leading-tight">Monitor de Concursos Docentes</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-xs text-indigo-200 hidden sm:block">
            {appState?.lastRunAt && (
              <div>Último chequeo: {formatDate(appState.lastRunAt)}</div>
            )}
            {appState?.lastFoundCount != null && (
              <div>Encontrados en último run: {appState.lastFoundCount}</div>
            )}
          </div>
          {user.email && (
            <div className="flex items-center gap-2">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full border-2 border-indigo-400" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                  {user.name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-indigo-200 text-xs hidden md:block">{user.name || user.email}</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Filtros</h2>

            {/* Departments */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Departamento</p>
              <div className="space-y-1.5">
                {DEPARTMENTS.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={cfg.categoryDepts.includes(d.id)}
                      onChange={() => toggleDept(d.id)}
                      className="w-4 h-4 rounded border-gray-300 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-indigo-600 transition-colors">
                      {d.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Levels */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nivel educativo</p>
              <div className="space-y-1.5">
                {LEVELS.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={cfg.categoryLevels.includes(l.id)}
                      onChange={() => toggleLevel(l.id)}
                      className="w-4 h-4 rounded border-gray-300 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-indigo-600 transition-colors">
                      {l.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Search */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Buscar en título</p>
              <input
                type="text"
                placeholder="ej: maestro, cátedra..."
                value={cfg.searchString}
                onChange={(e) => setCfg((c) => ({ ...c, searchString: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Config section */}
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Alerta por email</h2>

            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Enviar a
              </label>
              <input
                type="email"
                placeholder="destino@ejemplo.com"
                value={cfg.emailTo}
                onChange={(e) => setCfg((c) => ({ ...c, emailTo: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Horario (cron UTC)
              </label>
              <input
                type="text"
                value={cfg.scheduleCron}
                onChange={(e) => setCfg((c) => ({ ...c, scheduleCron: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <p className="text-xs text-indigo-600 mt-1">{cronToHumanART(cfg.scheduleCron)}</p>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="isActive"
                checked={cfg.isActive}
                onChange={(e) => setCfg((c) => ({ ...c, isActive: e.target.checked }))}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">Bot activo</label>
            </div>

            <button
              onClick={saveConfig}
              disabled={saving}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
            {saveMsg && (
              <p className={`text-xs mt-2 text-center font-medium ${saveMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {saveMsg}
              </p>
            )}
          </div>

          {/* Bot actions */}
          <div className="p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Acciones</h2>
            <button
              onClick={() => runBotNow(false)}
              disabled={botRunning}
              className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors mb-2"
            >
              {botRunning ? 'Ejecutando…' : '▶ Buscar nuevos'}
            </button>
            <button
              onClick={() => runBotNow(true)}
              disabled={botRunning || !cfg.emailTo}
              className="w-full py-2 px-4 border border-indigo-300 hover:bg-indigo-50 disabled:opacity-40 text-indigo-700 text-sm font-semibold rounded-lg transition-colors"
            >
              📧 Enviar prueba ahora
            </button>
            {botMsg && (
              <p className={`text-xs mt-2 text-center font-medium ${botMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                {botMsg}
              </p>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                {loading ? 'Cargando…' : `${total.toLocaleString('es-AR')} concurso${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {cfg.categoryDepts.map((id) => CATEGORY_NAME[id]).join(', ')}
                {cfg.categoryDepts.length && cfg.categoryLevels.length ? ' · ' : ''}
                {cfg.categoryLevels.map((id) => CATEGORY_NAME[id]).join(', ')}
                {cfg.searchString ? ` · "${cfg.searchString}"` : ''}
              </p>
            </div>
            {loading && (
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Posts grid */}
          {posts.length === 0 && !loading ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm">No se encontraron concursos con los filtros actuales.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const { levels, depts } = levelBadge(post.categories)
                const title = decodeHtml(post.title.rendered)
                const excerpt = decodeHtml(post.excerpt.rendered)
                return (
                  <article
                    key={post.id}
                    className="bg-white rounded-xl border border-gray-100 p-4 hover:border-indigo-200 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {depts.map((id) => (
                            <span key={id} className="inline-block bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                              {CATEGORY_NAME[id]}
                            </span>
                          ))}
                          {levels.map((id) => (
                            <span key={id} className="inline-block bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                              {CATEGORY_NAME[id]}
                            </span>
                          ))}
                        </div>
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-800 font-semibold text-sm leading-snug hover:text-indigo-600 transition-colors block mb-1.5"
                        >
                          {title}
                        </a>
                        {excerpt && (
                          <p className="text-gray-500 text-xs leading-relaxed mb-2 line-clamp-2">{excerpt}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-xs">{formatDateShort(post.date)}</span>
                          <a
                            href={post.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Ver concurso →
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}

              {posts.length < total && (
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={loading}
                  className="w-full py-3 text-sm font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-xl transition-colors bg-white"
                >
                  {loading ? 'Cargando…' : `Cargar más (${total - posts.length} restantes)`}
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-3 px-6 text-center">
        <p className="text-xs text-gray-400">
          Desarrollado por{' '}
          <a href="https://puntoindigo.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-medium hover:underline">
            Puntoindigo
          </a>
          {' '}· Monitor de Concursos CGE Entre Ríos
        </p>
      </footer>
    </div>
  )
}
