'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DEPARTMENTS, LEVELS, CATEGORY_NAME } from '@/lib/categories'
import InvitePanel from './InvitePanel'

interface User {
  email: string
  name: string
  picture: string
  isSuperadmin: boolean
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

type ModalType = 'alerts' | 'invites' | 'logout' | null

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
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function levelBadge(categoryIds: number[]) {
  const levels = [149, 150, 151, 152, 208]
  const depts = [45, 26, 29, 30, 33, 59, 34, 37, 39, 57, 41, 43]
  return {
    levels: categoryIds.filter((id) => levels.includes(id)),
    depts: categoryIds.filter((id) => depts.includes(id)),
  }
}

function cronToHumanART(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length < 2) return cron
  const minUTC = parseInt(parts[0])
  const hourUTC = parseInt(parts[1])
  if (isNaN(hourUTC)) return cron
  const hourART = (hourUTC - 3 + 24) % 24
  return `${String(hourART).padStart(2, '0')}:${String(minUTC).padStart(2, '0')} hs (hora Argentina)`
}

function CategoryBadges({ ids }: { ids: number[] }) {
  const { levels, depts } = levelBadge(ids)
  return (
    <div className="flex flex-wrap gap-1.5">
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
  )
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

  // searchString always starts empty — don't restore from DB to avoid stale searches on reload
  const [cfg, setCfg] = useState<Config>({
    ...(initialConfig ?? defaultConfig),
    searchString: '',
  })
  const [appState, setAppState] = useState<AppState | null>(initialState)
  const [posts, setPosts] = useState<WpPost[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [wpTotalPages, setWpTotalPages] = useState(1)
  const [afterDays, setAfterDays] = useState(0)
  const [deptOpen, setDeptOpen] = useState(true)
  const [levelOpen, setLevelOpen] = useState(true)

  // Settings state
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [botRunning, setBotRunning] = useState(false)
  const [botMsg, setBotMsg] = useState<string | null>(null)

  // UI: user dropdown + modals
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState<ModalType>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Post detail modal
  const [selectedPost, setSelectedPost] = useState<WpPost | null>(null)
  const [postContent, setPostContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)

  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  // Fetch full post content when modal opens
  useEffect(() => {
    if (!selectedPost) { setPostContent(null); return }
    setContentLoading(true)
    setPostContent(null)
    let cancelled = false
    fetch(`/api/post/${selectedPost.id}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setPostContent(d.content ?? '') })
      .catch(() => { if (!cancelled) setPostContent('') })
      .finally(() => { if (!cancelled) setContentLoading(false) })
    return () => { cancelled = true }
  }, [selectedPost])

  // Login notification — once per browser session
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

  const fetchPosts = useCallback(async (c: Config, p: number, days: number) => {
    if (!c.categoryDepts.length && !c.categoryLevels.length) {
      setPosts([])
      setWpTotalPages(1)
      return
    }
    setLoading(true)
    try {
      const sp = new URLSearchParams({
        depts: c.categoryDepts.join(','),
        levels: c.categoryLevels.join(','),
        search: c.searchString,
        page: String(p),
        afterDays: String(days),
      })
      const res = await fetch(`/api/posts?${sp}`)
      const data = await res.json()
      if (p === 1) {
        setPosts(data.posts ?? [])
      } else {
        setPosts((prev) => [...prev, ...(data.posts ?? [])])
      }
      setWpTotalPages(data.totalPages ?? 1)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced fetch when filters change — resets to page 1
  // Clear results immediately so stale data never shows while new fetch is in-flight.
  useEffect(() => {
    setPage(1)
    setPosts([])
    setLoading(true)
    if (fetchTimer.current) clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(() => fetchPosts(cfg, 1, afterDays), 150)
    return () => { if (fetchTimer.current) clearTimeout(fetchTimer.current) }
  }, [cfg.categoryDepts, cfg.categoryLevels, cfg.searchString, afterDays, fetchPosts])
  // NOTE: no separate useEffect for load-more — it's handled directly in the button click
  // to avoid race conditions when filters change while page > 1.

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

  // ─────────────────────────────────────────────────────────────────────
  // Shared modal wrapper
  // ─────────────────────────────────────────────────────────────────────
  function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none transition-colors">×</button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{ background: 'linear-gradient(135deg,#4338ca 0%,#6366f1 100%)' }}
        className="px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-0.5">
            Consejo General de Educación · Entre Ríos
          </p>
          <h1 className="text-white text-xl font-bold leading-tight">Monitor de Concursos Docentes</h1>
        </div>

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-indigo-700/50 transition-colors"
          >
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full border-2 border-indigo-400" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                {user.name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-indigo-200 text-sm hidden md:block">{user.name || user.email}</span>
            <span className="text-indigo-300 text-xs">{dropdownOpen ? '▲' : '▼'}</span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-40">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={() => { setModalOpen('alerts'); setDropdownOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
              >
                <span>✉️</span> Alertas por email
              </button>
              {user.isSuperadmin && (
                <button
                  onClick={() => { setModalOpen('invites'); setDropdownOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                >
                  <span>👥</span> Accesos invitados
                </button>
              )}
              {appState?.lastRunAt && (
                <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
                  Último bot: {formatDate(appState.lastRunAt)}
                </div>
              )}
              <div className="border-t border-gray-100 mt-1">
                <button
                  onClick={() => { setModalOpen('logout'); setDropdownOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <span>→</span> Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar — filters only */}
        <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Filtros</h2>

            {/* Departments — collapsible */}
            <div className="mb-4">
              <button type="button"
                onClick={() => setDeptOpen((v) => !v)}
                className="w-full flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Departamento</span>
                <span className="text-gray-400 text-xs">{deptOpen ? '▲' : '▼'}</span>
              </button>
              {!deptOpen && (
                <p className={`text-xs mb-1 ${cfg.categoryDepts.length ? 'text-indigo-600 font-medium' : 'text-gray-400 italic'}`}>
                  {cfg.categoryDepts.length
                    ? cfg.categoryDepts.map((id) => CATEGORY_NAME[id]).join(', ')
                    : 'Ninguno'}
                </p>
              )}
              {deptOpen && (
                <div className="space-y-1.5">
                  {DEPARTMENTS.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox"
                        checked={cfg.categoryDepts.includes(d.id)}
                        onChange={() => toggleDept(d.id)}
                        className="w-4 h-4 rounded border-gray-300 accent-indigo-600" />
                      <span className="text-sm text-gray-700 group-hover:text-indigo-600 transition-colors">
                        {d.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Levels — collapsible */}
            <div className="mb-5">
              <button type="button"
                onClick={() => setLevelOpen((v) => !v)}
                className="w-full flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nivel educativo</span>
                <span className="text-gray-400 text-xs">{levelOpen ? '▲' : '▼'}</span>
              </button>
              {!levelOpen && (
                <p className={`text-xs mb-1 ${cfg.categoryLevels.length ? 'text-indigo-600 font-medium' : 'text-gray-400 italic'}`}>
                  {cfg.categoryLevels.length
                    ? cfg.categoryLevels.map((id) => CATEGORY_NAME[id]).join(', ')
                    : 'Ninguno'}
                </p>
              )}
              {levelOpen && (
                <div className="space-y-1.5">
                  {LEVELS.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox"
                        checked={cfg.categoryLevels.includes(l.id)}
                        onChange={() => toggleLevel(l.id)}
                        className="w-4 h-4 rounded border-gray-300 accent-indigo-600" />
                      <span className="text-sm text-gray-700 group-hover:text-indigo-600 transition-colors">
                        {l.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Buscar en título o contenido
              </p>
              <input
                type="text"
                placeholder="ej: maestro, cátedra..."
                value={cfg.searchString}
                onChange={(e) => setCfg((c) => ({ ...c, searchString: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Date filter */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Fecha desde</p>
              <select
                value={afterDays}
                onChange={(e) => setAfterDays(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value={0}>Todos</option>
                <option value={1}>Hoy</option>
                <option value={7}>Últimos 7 días</option>
                <option value={15}>Últimos 15 días</option>
                <option value={30}>Últimos 30 días</option>
              </select>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                {loading && posts.length === 0
                  ? 'Cargando…'
                  : `${posts.length.toLocaleString('es-AR')} concurso${posts.length !== 1 ? 's' : ''} encontrado${posts.length !== 1 ? 's' : ''}`}
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

          {posts.length === 0 && !loading ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm">No se encontraron concursos con los filtros actuales.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const title = decodeHtml(post.title.rendered)
                const excerpt = decodeHtml(post.excerpt.rendered)
                return (
                  <article
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className="bg-white rounded-xl border border-gray-100 p-4 hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer"
                  >
                    <CategoryBadges ids={post.categories} />
                    <p className="text-gray-800 font-semibold text-sm leading-snug mt-2 mb-1.5 group-hover:text-indigo-700 transition-colors">
                      {title}
                    </p>
                    {excerpt && (
                      <p className="text-gray-500 text-xs leading-relaxed mb-2 line-clamp-2">{excerpt}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">{formatDateShort(post.date)}</span>
                      <span className="text-indigo-500 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver detalle →
                      </span>
                    </div>
                  </article>
                )
              })}

              {page < wpTotalPages && (
                <button
                  onClick={() => {
                    const next = page + 1
                    setPage(next)
                    fetchPosts(cfg, next, afterDays)
                  }}
                  disabled={loading}
                  className="w-full py-3 text-sm font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-xl transition-colors bg-white"
                >
                  {loading ? 'Buscando…' : 'Ver más resultados'}
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
          <a href="https://puntoindigo.com" target="_blank" rel="noopener noreferrer"
            className="text-indigo-600 font-medium hover:underline">Puntoindigo</a>
          {' '}· Monitor de Concursos CGE Entre Ríos
        </p>
      </footer>

      {/* ── Post detail modal ───────────────────────────────────── */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setSelectedPost(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-4 z-10">
              <div className="flex-1 min-w-0">
                <CategoryBadges ids={selectedPost.categories} />
                <h2 className="text-base font-bold text-gray-900 leading-snug mt-2">
                  {decodeHtml(selectedPost.title.rendered)}
                </h2>
                <p className="text-xs text-gray-400 mt-1">{formatDate(selectedPost.date)}</p>
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0 transition-colors mt-1"
                aria-label="Cerrar">×</button>
            </div>

            <div className="px-6 py-5">
              {contentLoading && (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!contentLoading && postContent && (
                <div
                  className="wp-content text-sm text-gray-800 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: postContent }}
                />
              )}
              {!contentLoading && !postContent && (
                <p className="text-sm text-gray-500 italic">No se pudo cargar el contenido.</p>
              )}
            </div>

            <div className="px-6 pb-6">
              <a
                href={selectedPost.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors"
              >
                Ver en el sitio del CGE →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerts modal ───────────────────────────────────────── */}
      {modalOpen === 'alerts' && (
        <Modal title="Alertas por email" onClose={() => setModalOpen(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Enviar a</label>
              <input
                type="email"
                placeholder="destino@ejemplo.com"
                value={cfg.emailTo}
                onChange={(e) => setCfg((c) => ({ ...c, emailTo: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Término de búsqueda para el bot
              </label>
              <input
                type="text"
                placeholder="ej: maestro, cátedra..."
                value={cfg.searchString}
                onChange={(e) => setCfg((c) => ({ ...c, searchString: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
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
            <div className="flex items-center gap-2">
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
              <p className={`text-xs text-center font-medium ${saveMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {saveMsg}
              </p>
            )}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <button
                onClick={() => runBotNow(false)}
                disabled={botRunning}
                className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {botRunning ? 'Ejecutando…' : '▶ Buscar nuevos ahora'}
              </button>
              <button
                onClick={() => runBotNow(true)}
                disabled={botRunning || !cfg.emailTo}
                className="w-full py-2 px-4 border border-indigo-300 hover:bg-indigo-50 disabled:opacity-40 text-indigo-700 text-sm font-semibold rounded-lg transition-colors"
              >
                Enviar prueba por email
              </button>
              {botMsg && (
                <p className={`text-xs text-center font-medium ${botMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                  {botMsg}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Invites modal (superadmin) ─────────────────────────── */}
      {modalOpen === 'invites' && user.isSuperadmin && (
        <Modal title="Accesos invitados" onClose={() => setModalOpen(null)}>
          <InvitePanel />
        </Modal>
      )}

      {/* ── Logout confirmation ─────────────────────────────────── */}
      {modalOpen === 'logout' && (
        <Modal title="Cerrar sesión" onClose={() => setModalOpen(null)}>
          <p className="text-sm text-gray-600 mb-6">
            ¿Confirmás que querés cerrar sesión?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setModalOpen(null)}
              className="flex-1 py-2 px-4 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <a
              href="https://accounts.puntoindigo.com/api/auth/logout"
              className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold text-white text-center transition-colors"
            >
              Cerrar sesión
            </a>
          </div>
        </Modal>
      )}
    </div>
  )
}
