'use client'

import { useState, useEffect } from 'react'

interface Invite {
  id: number
  email: string
  label: string | null
  invitedBy: string
  invitedAt: string
}

interface Props {
  user: { email: string; isSuperadmin: boolean }
}

export default function InvitePanel({ user }: Props) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/invites')
      const data = await res.json()
      setInvites(data.invites ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), label: label.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Error al invitar', ok: false })
      } else {
        setMsg({
          text: data.emailSent
            ? `✓ Invitación enviada a ${email}`
            : `✓ Acceso agregado (el email no se pudo enviar)`,
          ok: true,
        })
        setEmail('')
        setLabel('')
        load()
      }
    } catch {
      setMsg({ text: 'Error de conexión', ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(inviteEmail: string) {
    if (!confirm(`¿Eliminar acceso de ${inviteEmail}?`)) return
    try {
      await fetch('/api/invites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      })
      load()
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
        Accesos invitados
      </h2>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="mb-5 space-y-2">
        <input
          type="email"
          placeholder="gmail@ejemplo.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="text"
          placeholder="Nombre (opcional)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {saving ? 'Enviando…' : '+ Invitar'}
        </button>
        {msg && (
          <p className={`text-xs text-center font-medium ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
            {msg.text}
          </p>
        )}
      </form>

      {/* Invited list */}
      {loading ? (
        <p className="text-xs text-gray-400 text-center">Cargando…</p>
      ) : invites.length === 0 ? (
        <p className="text-xs text-gray-400 text-center">Ningún invitado todavía</p>
      ) : (
        <ul className="space-y-2">
          {invites.map(inv => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-800 truncate">{inv.label || inv.email}</p>
                {inv.label && (
                  <p className="text-xs text-gray-400 truncate">{inv.email}</p>
                )}
                {inv.invitedBy && (
                  <p className="text-xs text-gray-400 truncate">
                    Referente: {inv.invitedBy}
                  </p>
                )}
              </div>
              {user.isSuperadmin && (
                <button
                  onClick={() => handleRemove(inv.email)}
                  className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none"
                  title="Eliminar acceso"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
