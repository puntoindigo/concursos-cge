'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DEPARTMENTS, LEVELS, AREAS, CATEGORY_NAME } from '@/lib/categories'
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

type ModalType = 'alerts' | 'invites' | 'logout' | 'logs' | null

interface RunLog {
  id: number
  ranAt: string
  postsFound: number
  emailSent: boolean
  emailTo: string | null
  wpApiDown: boolean
}

interface QueryLog {
  id: number
  queriedAt: string
  userEmail: string | null
  depts: number[] | null
  levels: number[] | null
  search: string | null
  resultsCount: number
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

function cronToARTHour(cron: string): number {
  const parts = cron.split(' ')
  if (parts.length < 2) return 8
  const utcHour = parseInt(parts[1])
  if (isNaN(utcHour)) return 8
  return (utcHour - 3 + 24) % 24
}

function artHourToCron(artHour: number): string {
  return `0 ${(artHour + 3) % 24} * * *`
}

function nextCronRunART(cron: string): string {
  const artHour = cronToARTHour(cron)
  const artNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const next = new Date(artNow)
  next.setHours(artHour, 0, 0, 0)
  if (artNow.getHours() > artHour || (artNow.getHours() === artHour && artNow.getMinutes() > 0)) {
    next.setDate(next.getDate() + 1)
  }
  return next.toLocaleDateString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
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
  const [cacheRefreshing, setCacheRefreshing] = useState(false)
  const [wpApiDown, setWpApiDown] = useState(false)
  const [page, setPage] = useState(1)
  const [wpTotalPages, setWpTotalPages] = useState(1)
  const [afterDays, setAfterDays] = useState(0)
  const [deptOpen, setDeptOpen] = useState(true)
  const [levelOpen, setLevelOpen] = useState(true)
  const [areaOpen, setAreaOpen] = useState(true)
  const [areaFilter, setAreaFilter] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Settings state
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [botRunning, setBotRunning] = useState(false)
  const [botMsg, setBotMsg] = useState<string | null>(null)
  const [sendToEmail, setSendToEmail] = useState('')

  // UI: user dropdown + modals
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState<ModalType>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Admin logs
  const [adminLogs, setAdminLogs] = useState<{ runs: RunLog[]; queries: QueryLog[] } | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsTab, setLogsTab] = useState<'runs' | 'queries'>('runs')

  // Post detail modal
  const [selectedPost, setSelectedPost] = useState<WpPost | null>(null)
  const [postContent, setPostContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)

  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Always holds the latest query args so the retry timer can use them without a stale closure
  const latestQueryRef = useRef({ cfg, afterDays, areaFilter })
  useEffect(() => { latestQueryRef.current = { cfg, afterDays, areaFilter } })
  const [retryCount, setRetryCount] = useState(0)

  // Load admin logs when the logs modal opens
  useEffect(() => {
    if (modalOpen !== 'logs') return
    setLogsLoading(true)
    fetch('/api/admin/logs')
      .then((r) => r.json())
      .then((data) => setAdminLogs(data))
      .catch(() => {})
      .finally(() => setLogsLoading(false))
  }, [modalOpen])

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
      setCacheRefreshing(data.isRefreshing === true)
      setWpApiDown(data.wpApiDown === true)
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
    setRetryCount(0)
    if (fetchTimer.current) clearTimeout(fetchTimer.current)
    const combined = [areaFilter, cfg.searchString].filter(Boolean).join(' ').trim()
    fetchTimer.current = setTimeout(() => fetchPosts({ ...cfg, searchString: combined }, 1, afterDays), 150)
    return () => { if (fetchTimer.current) clearTimeout(fetchTimer.current) }
  }, [cfg.categoryDepts, cfg.categoryLevels, cfg.searchString, areaFilter, afterDays, fetchPosts])
  // NOTE: no separate useEffect for load-more — it's handled directly in the button click
  // to avoid race conditions when filters change while page > 1.

  // When a background refresh was dispatched, re-check after 75s so the result
  // of the GitHub Actions run (wpApiDown flag or new posts) reaches the client.
  // Max 5 retries to keep checking while the user has the page open.
  useEffect(() => {
    if (!cacheRefreshing || retryCount >= 5) return
    const timer = setTimeout(() => {
      setRetryCount((n) => n + 1)
      const { cfg: c, afterDays: d, areaFilter: a } = latestQueryRef.current
      const combined = [a, c.searchString].filter(Boolean).join(' ').trim()
      fetchPosts({ ...c, searchString: combined }, 1, d)
    }, 75_000)
    return () => clearTimeout(timer)
  }, [cacheRefreshing, retryCount, fetchPosts])

  // Auto-refresh: every 60s check if lastRunAt is > 20 min old; if so, refresh posts
  useEffect(() => {
    const interval = setInterval(() => {
      const { cfg: c, afterDays: d, areaFilter: a } = latestQueryRef.current
      const lastRun = appState?.lastRunAt ? new Date(appState.lastRunAt).getTime() : 0
      if (!lastRun || Date.now() - lastRun > 20 * 60 * 1000) {
        const combined = [a, c.searchString].filter(Boolean).join(' ').trim()
        fetchPosts({ ...c, searchString: combined }, 1, d)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [appState?.lastRunAt, fetchPosts])

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
        body: JSON.stringify({ ...cfg, emailTo: user.email, searchString: areaFilter }),
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

  async function runBotNow(forceEmail = false, emailOverride?: string) {
    setBotRunning(true)
    setBotMsg(null)
    const combined = [areaFilter, cfg.searchString].filter(Boolean).join(' ').trim()
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceEmail,
          depts: cfg.categoryDepts,
          levels: cfg.categoryLevels,
          searchString: combined,
          ...(emailOverride ? { emailTo: emailOverride } : {}),
        }),
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
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-indigo-700/50 transition-colors"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Filtros"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1" />
              <rect y="9" width="20" height="2" rx="1" />
              <rect y="15" width="20" height="2" rx="1" />
            </svg>
          </button>
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-0.5">
              Consejo General de Educación · Entre Ríos
            </p>
            <h1 className="text-white text-xl font-bold leading-tight">Monitor de Concursos Docentes</h1>
          </div>
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
              <button
                onClick={() => { setModalOpen('invites'); setDropdownOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
              >
                <span>👥</span> Accesos invitados
              </button>
              {user.isSuperadmin && (
                <button
                  onClick={() => { setModalOpen('logs'); setDropdownOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                >
                  <span>📊</span> Log de sistema
                </button>
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

      {/* ── Status bar — always visible ─────────────────────────── */}
      <div className={`border-b px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${wpApiDown ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-100'}`}>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${wpApiDown ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span className={`font-semibold ${wpApiDown ? 'text-red-700' : 'text-emerald-700'}`}>
            {wpApiDown ? 'API CGE CAÍDA' : 'API CGE activa'}
          </span>
        </span>
        {wpApiDown && (
          <span className="text-red-600">Estás viendo datos del último acceso exitoso</span>
        )}
        <span className="ml-auto text-gray-400">
          {appState?.lastRunAt
            ? `Actualizado: ${formatDate(appState.lastRunAt)}`
            : 'Sin datos de actualización'}
        </span>
      </div>

      {/* ── Layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — filters only */}
        <aside className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col overflow-y-auto
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:inset-y-auto md:left-auto md:translate-x-0 md:z-auto md:flex-shrink-0
        `}>
          <div className="p-5">
            {/* Mobile close button */}
            <div className="flex items-center justify-between mb-4 md:hidden">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Filtros</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none transition-colors"
                aria-label="Cerrar filtros"
              >×</button>
            </div>
            <h2 className="hidden md:block text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Filtros</h2>

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

            {/* Area / Discipline — quick-search shortcuts */}
            <div className="mb-4">
              <button type="button"
                onClick={() => setAreaOpen((v) => !v)}
                className="w-full flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Área / Disciplina</span>
                <span className="text-gray-400 text-xs">{areaOpen ? '▲' : '▼'}</span>
              </button>
              {!areaOpen && areaFilter && (
                <p className="text-xs mb-1 text-indigo-600 font-medium">
                  {AREAS.find((a) => a.term === areaFilter)?.name ?? areaFilter}
                </p>
              )}
              {areaOpen && (
                <div className="flex flex-wrap gap-1.5">
                  {AREAS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAreaFilter((f) => (f === a.term ? '' : a.term))}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        areaFilter === a.term
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {a.name}
                    </button>
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
                {areaFilter ? ` · ${AREAS.find((a) => a.term === areaFilter)?.name ?? areaFilter}` : ''}
                {cfg.searchString ? ` · "${cfg.searchString}"` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {cacheRefreshing && !loading && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />
                  {retryCount > 0 ? `Reintentando… (${retryCount}/5)` : 'Actualizando…'}
                </span>
              )}
              {loading && (
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>

          {posts.length === 0 && !loading ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-4xl mb-3">{wpApiDown ? '⚠️' : cacheRefreshing ? '🔄' : '🔍'}</div>
              <p className="text-sm">
                {wpApiDown
                  ? 'El sitio del CGE no está disponible. Se mostrarán los datos cuando vuelva en línea.'
                  : cacheRefreshing
                  ? retryCount > 0
                    ? `Verificando si el CGE volvió en línea… (intento ${retryCount} de 5)`
                    : 'Verificando si hay nuevos concursos… puede tardar hasta un minuto.'
                  : 'No se encontraron concursos con los filtros actuales.'}
              </p>
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
                    const combined = [areaFilter, cfg.searchString].filter(Boolean).join(' ').trim()
                    fetchPosts({ ...cfg, searchString: combined }, next, afterDays)
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
            {/* Bot status summary */}
            <div className={`rounded-xl px-4 py-3 flex items-start gap-3 ${cfg.isActive ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-100 border border-gray-200'}`}>
              <span className={`mt-0.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${cfg.isActive ? 'text-emerald-800' : 'text-gray-500'}`}>
                  Bot {cfg.isActive ? 'ACTIVO' : 'INACTIVO'}
                </p>
                {cfg.isActive && (
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Próxima ejecución: <strong>{nextCronRunART(cfg.scheduleCron)}</strong>
                  </p>
                )}
                {appState?.lastRunAt && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Última ejecución: {formatDate(appState.lastRunAt)}
                    {typeof appState.lastFoundCount === 'number' && (
                      <> — {appState.lastFoundCount} concurso{appState.lastFoundCount !== 1 ? 's' : ''} encontrado{appState.lastFoundCount !== 1 ? 's' : ''}</>
                    )}
                  </p>
                )}
                {!appState?.lastRunAt && (
                  <p className="text-xs text-gray-400 mt-0.5">Sin ejecuciones registradas aún</p>
                )}
              </div>
            </div>

            {/* Destination — editable, defaults to logged-in user */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Enviar a</label>
              <input
                type="email"
                value={sendToEmail}
                onChange={(e) => setSendToEmail(e.target.value)}
                placeholder={user.email}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400"
              />
              <p className="text-xs text-gray-400 mt-0.5">Si se deja vacío, se usa tu email ({user.email})</p>
            </div>

            {/* Active filters summary */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Filtros activos (el bot usará estos)</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg space-y-0.5">
                <p className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Departamento:</span>{' '}
                  {cfg.categoryDepts.length ? cfg.categoryDepts.map((id) => CATEGORY_NAME[id]).join(', ') : 'Ninguno'}
                </p>
                <p className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Nivel:</span>{' '}
                  {cfg.categoryLevels.length ? cfg.categoryLevels.map((id) => CATEGORY_NAME[id]).join(', ') : 'Ninguno'}
                </p>
                <p className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Área:</span>{' '}
                  {areaFilter ? (AREAS.find((a) => a.term === areaFilter)?.name ?? areaFilter) : 'Todas'}
                </p>
                {cfg.searchString && (
                  <p className="text-xs text-gray-600">
                    <span className="font-medium text-gray-700">Búsqueda:</span>{' '}
                    &ldquo;{cfg.searchString}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* ART hour picker */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Horario de envío (hora Argentina)</label>
              <select
                value={cronToARTHour(cfg.scheduleCron)}
                onChange={(e) => setCfg((c) => ({ ...c, scheduleCron: artHourToCron(Number(e.target.value)) }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00 hs</option>
                ))}
              </select>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
              <input
                type="checkbox"
                id="isActive"
                checked={cfg.isActive}
                onChange={(e) => setCfg((c) => ({ ...c, isActive: e.target.checked }))}
                className="w-4 h-4 rounded accent-indigo-600 flex-shrink-0"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700 cursor-pointer select-none">
                <span className="font-medium">Activar bot</span>
                <span className="text-gray-400 ml-1.5">— el bot correrá automáticamente al horario elegido</span>
              </label>
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

            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => runBotNow(true, sendToEmail || user.email)}
                disabled={botRunning || !user.email}
                className="w-full py-2 px-4 border border-indigo-300 hover:bg-indigo-50 disabled:opacity-40 text-indigo-700 text-sm font-semibold rounded-lg transition-colors"
              >
                {botRunning ? 'Ejecutando…' : 'Enviar prueba por email ahora'}
              </button>
              {botMsg && (
                <p className={`text-xs text-center font-medium mt-2 ${botMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                  {botMsg}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Invites modal ──────────────────────────────────────── */}
      {modalOpen === 'invites' && (
        <Modal title="Accesos invitados" onClose={() => setModalOpen(null)}>
          <InvitePanel user={user} />
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
              href={`https://accounts.puntoindigo.com/api/auth/logout?next=${encodeURIComponent('https://concursos-cge.puntoindigo.com')}`}
              className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold text-white text-center transition-colors"
            >
              Cerrar sesión
            </a>
          </div>
        </Modal>
      )}

      {/* ── Admin logs modal ─────────────────────────────────────── */}
      {modalOpen === 'logs' && (
        <Modal title="Log del sistema" onClose={() => setModalOpen(null)}>
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4 -mx-1">
            <button
              onClick={() => setLogsTab('runs')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${logsTab === 'runs' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Ejecuciones del bot
            </button>
            <button
              onClick={() => setLogsTab('queries')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${logsTab === 'queries' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Consultas de usuarios
            </button>
          </div>

          {logsLoading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!logsLoading && adminLogs && logsTab === 'runs' && (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {adminLogs.runs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Sin ejecuciones registradas</p>
              )}
              {adminLogs.runs.map((run) => (
                <div
                  key={run.id}
                  className={`rounded-lg px-3 py-2.5 text-xs border ${run.wpApiDown ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}
                >
                  <div className="flex items-center gap-2 justify-between">
                    <span className="font-semibold text-gray-700">{formatDate(run.ranAt)}</span>
                    <span className={`font-bold ${run.wpApiDown ? 'text-red-600' : 'text-emerald-600'}`}>
                      {run.wpApiDown ? 'API CAÍDA' : `${run.postsFound} concurso${run.postsFound !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-gray-500">
                    {run.emailSent && <span className="text-indigo-600">✓ Email enviado</span>}
                    {!run.emailSent && !run.wpApiDown && <span>Sin email</span>}
                    {run.emailTo && <span className="truncate">{run.emailTo}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!logsLoading && adminLogs && logsTab === 'queries' && (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {adminLogs.queries.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Sin consultas registradas</p>
              )}
              {adminLogs.queries.map((q) => (
                <div key={q.id} className="rounded-lg px-3 py-2.5 text-xs border bg-gray-50 border-gray-200">
                  <div className="flex items-center gap-2 justify-between">
                    <span className="font-semibold text-gray-700">{formatDate(q.queriedAt)}</span>
                    <span className="text-indigo-700 font-medium">{q.resultsCount} resultado{q.resultsCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-gray-500 flex-wrap">
                    <span className="text-gray-600 font-medium truncate">{q.userEmail ?? '—'}</span>
                    {q.depts && q.depts.length > 0 && (
                      <span>Dpto: {q.depts.map((id) => CATEGORY_NAME[id] ?? id).join(', ')}</span>
                    )}
                    {q.levels && q.levels.length > 0 && (
                      <span>Nivel: {q.levels.map((id) => CATEGORY_NAME[id] ?? id).join(', ')}</span>
                    )}
                    {q.search && <span>Búsq: &ldquo;{q.search}&rdquo;</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!logsLoading && !adminLogs && (
            <p className="text-sm text-red-500 text-center py-6">Error al cargar el log</p>
          )}
        </Modal>
      )}
    </div>
  )
}
