import { useState, useMemo, useEffect } from 'react'
import { Megaphone, Plus, Eye, Bell, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { Announcement } from '@/types'

const ROLE_OPTIONS = [
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'rh', label: 'RH' },
  { value: 'admin', label: 'Admin' },
] as const

type TargetRole = Announcement['targetRoles'][number]

const CAN_CREATE_ROLES = ['gerente', 'admin', 'supervisor']

export default function MuralPage() {
  const { state, dispatch } = useApp()
  const role = state.currentUser.role
  const loggedEmployeeId = localStorage.getItem('orion_logged_employee') || ''
  const canCreate = CAN_CREATE_ROLES.includes(role)

  // Load from API on mount
  useEffect(() => {
    api.get<Announcement[]>('/api/announcements')
      .then(data => dispatch({ type: 'SET_ANNOUNCEMENTS', payload: data }))
      .catch(() => {})
  }, [dispatch])

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [targetRoles, setTargetRoles] = useState<TargetRole[]>([])

  // Employee name map
  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    state.employees.forEach(e => { m[e.id] = e.name })
    return m
  }, [state.employees])

  // Map currentUser role to announcement targetRoles vocabulary
  const roleForFilter: TargetRole = role === 'rh' ? 'rh' : role === 'admin' ? 'admin' : role === 'gerente' ? 'gerente' : role === 'supervisor' ? 'supervisor' : 'colaborador'

  // Visible announcements: targeted at user's role, sorted newest first
  const visibleAnnouncements = useMemo(() => {
    return [...state.announcements]
      .filter(a => a.targetRoles.includes(roleForFilter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [state.announcements, roleForFilter])

  const unreadCount = useMemo(() => {
    return visibleAnnouncements.filter(a => !a.readBy.includes(loggedEmployeeId)).length
  }, [visibleAnnouncements, loggedEmployeeId])

  function toggleRole(r: TargetRole) {
    setTargetRoles(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    )
  }

  function resetForm() {
    setTitle('')
    setBody('')
    setPriority('normal')
    setTargetRoles([])
    setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim() || targetRoles.length === 0) return

    const announcement: Announcement = {
      id: `ann-${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
      createdBy: loggedEmployeeId,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      targetRoles: [...targetRoles],
      priority,
      readBy: [],
    }

    try {
      await api.post('/api/announcements', announcement)
      const fresh = await api.get<Announcement[]>('/api/announcements')
      dispatch({ type: 'SET_ANNOUNCEMENTS', payload: fresh })
    } catch {
      dispatch({ type: 'ADD_ANNOUNCEMENT', payload: announcement })
    }
    resetForm()
  }

  async function handleMarkRead(announcementId: string) {
    try {
      await api.post(`/api/announcements/${announcementId}/read`, { employeeId: loggedEmployeeId })
      const fresh = await api.get<Announcement[]>('/api/announcements')
      dispatch({ type: 'SET_ANNOUNCEMENTS', payload: fresh })
    } catch {
      dispatch({
        type: 'MARK_ANNOUNCEMENT_READ',
        payload: { announcementId, employeeId: loggedEmployeeId },
      })
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mural de Avisos</h1>
            <p className="text-sm text-muted-foreground">
              {visibleAnnouncements.length} aviso{visibleAnnouncements.length !== 1 ? 's' : ''}
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                  <Bell className="h-3 w-3" />
                  {unreadCount} nao lido{unreadCount !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        {canCreate && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancelar' : 'Novo Aviso'}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && canCreate && (
        <Card className="border-primary/30">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Criar Aviso</h2>

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Titulo
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Titulo do aviso..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Body */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Mensagem
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Conteudo do aviso..."
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none resize-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Prioridade
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPriority('normal')}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    priority === 'normal'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('urgent')}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    priority === 'urgent'
                      ? 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-border text-muted-foreground hover:border-red-500/50'
                  )}
                >
                  Urgente
                </button>
              </div>
            </div>

            {/* Target Roles */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Visivel para
              </label>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      targetRoles.includes(opt.value)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={targetRoles.includes(opt.value)}
                      onChange={() => toggleRole(opt.value)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {targetRoles.length === 0 && (
                <p className="mt-1 text-xs text-red-400">Selecione ao menos um cargo</p>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!title.trim() || !body.trim() || targetRoles.length === 0}
                className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Publicar Aviso
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Announcements List */}
      {visibleAnnouncements.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Megaphone className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">Nenhum aviso para voce no momento.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleAnnouncements.map(ann => {
            const isUnread = !ann.readBy.includes(loggedEmployeeId)
            const isUrgent = ann.priority === 'urgent'
            const authorName = empMap[ann.createdBy] || ann.createdBy

            return (
              <Card
                key={ann.id}
                className={cn(
                  'relative transition-all',
                  isUrgent && 'border-red-500/40',
                  isUnread && 'ring-1 ring-primary/30 bg-primary/5'
                )}
              >
                {/* Urgent accent bar */}
                {isUrgent && (
                  <div className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-red-500" />
                )}

                <div className={cn(isUrgent && 'pl-3')}>
                  {/* Top row: badges + date */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {isUrgent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-red-400">
                        <Bell className="h-3 w-3" />
                        Urgente
                      </span>
                    )}
                    {isUnread && (
                      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                        Novo
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDate(ann.createdAt)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className={cn(
                    'text-base font-semibold',
                    isUrgent ? 'text-red-400' : 'text-foreground'
                  )}>
                    {ann.title}
                  </h3>

                  {/* Body */}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                    {ann.body}
                  </p>

                  {/* Footer: author, roles, read button */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
                    <span className="text-xs text-muted-foreground">
                      Por: <span className="font-medium text-foreground">{authorName}</span>
                    </span>

                    <div className="flex flex-wrap gap-1">
                      {ann.targetRoles.map(r => (
                        <span
                          key={r}
                          className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                        >
                          {r}
                        </span>
                      ))}
                    </div>

                    <div className="ml-auto">
                      {isUnread ? (
                        <button
                          onClick={() => handleMarkRead(ann.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Marcar como lido
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                          <Eye className="h-3.5 w-3.5" />
                          Lido
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
