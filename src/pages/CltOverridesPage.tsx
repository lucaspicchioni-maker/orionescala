import { useState, useEffect, useMemo } from 'react'
import { Shield, CheckCircle, AlertTriangle, Clock, Filter } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'

interface CltOverride {
  id: string
  weekStart: string
  overriddenById: string
  overriddenByName: string
  overriddenByRole: string
  justification: string
  violations: Array<{
    rule: string
    severity: string
    employeeId: string
    date: string
    message: string
  }>
  blockersCount: number
  warningsCount: number
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'))
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function CltOverridesPage() {
  const { state } = useApp()
  const { toast } = useToast()
  const [overrides, setOverrides] = useState<CltOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const role = state.currentUser.role
  const canReview = role === 'admin' || role === 'rh'

  useEffect(() => {
    loadOverrides()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadOverrides() {
    setLoading(true)
    try {
      const data = await api.get<CltOverride[]>('/api/clt-overrides')
      setOverrides(data)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao carregar audit log')
    } finally {
      setLoading(false)
    }
  }

  async function markReviewed(id: string) {
    try {
      await api.post(`/api/clt-overrides/${id}/review`, {})
      toast('success', 'Marcado como revisado')
      // Update local state
      setOverrides(prev => prev.map(o =>
        o.id === id
          ? { ...o, reviewedBy: state.currentUser.name, reviewedAt: new Date().toISOString() }
          : o,
      ))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao marcar como revisado')
    }
  }

  const filteredOverrides = useMemo(() => {
    if (filter === 'pending') return overrides.filter(o => !o.reviewedAt)
    if (filter === 'reviewed') return overrides.filter(o => !!o.reviewedAt)
    return overrides
  }, [overrides, filter])

  const pendingCount = overrides.filter(o => !o.reviewedAt).length

  // Employee name lookup
  const empMap = useMemo(() => {
    const m = new Map<string, string>()
    state.employees.forEach(e => m.set(e.id, e.name))
    return m
  }, [state.employees])

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Shield className="h-6 w-6 text-warning" />
          Auditoria CLT — Overrides
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registro permanente de publicações de escala com violações CLT (Art. 66 - Interjornada).
          Rastro legal para auditoria trabalhista futura.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="text-center !p-3">
          <Shield className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-1 text-2xl font-bold text-foreground">{overrides.length}</p>
          <p className="text-[10px] text-muted-foreground">Total de overrides</p>
        </Card>
        <Card className="text-center !p-3 border-warning/30 bg-warning/5">
          <Clock className="mx-auto h-5 w-5 text-warning" />
          <p className="mt-1 text-2xl font-bold text-warning">{pendingCount}</p>
          <p className="text-[10px] text-muted-foreground">Aguardando revisão</p>
        </Card>
        <Card className="text-center !p-3 border-success/30 bg-success/5">
          <CheckCircle className="mx-auto h-5 w-5 text-success" />
          <p className="mt-1 text-2xl font-bold text-success">{overrides.length - pendingCount}</p>
          <p className="text-[10px] text-muted-foreground">Revisados</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(['all', 'pending', 'reviewed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {f === 'all' ? 'Todos' : f === 'pending' ? `Pendentes (${pendingCount})` : 'Revisados'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filteredOverrides.length === 0 ? (
        <Card className="py-12 text-center">
          <Shield className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filter === 'pending' && 'Nenhum override aguardando revisão.'}
            {filter === 'reviewed' && 'Nenhum override revisado ainda.'}
            {filter === 'all' && 'Nenhum override registrado. Isso é bom.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOverrides.map(override => {
            const isExpanded = expanded === override.id
            const reviewed = !!override.reviewedAt
            return (
              <Card
                key={override.id}
                className={cn(
                  'border-l-4',
                  reviewed ? 'border-l-success/60' : 'border-l-warning/60',
                )}
              >
                {/* Summary row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={reviewed ? 'success' : 'warning'} size="sm">
                        {reviewed ? 'Revisado' : 'Pendente'}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">
                        Semana {override.weekStart}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {override.blockersCount} violação(ões)
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Publicado por <strong>{override.overriddenByName}</strong> ({override.overriddenByRole})
                      {' em '}
                      {formatDateTime(override.createdAt)}
                    </p>
                    {reviewed && (
                      <p className="mt-0.5 text-xs text-success">
                        ✓ Revisado por {override.reviewedBy} em {formatDateTime(override.reviewedAt!)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : override.id)}
                      className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      {isExpanded ? 'Ocultar' : 'Ver detalhes'}
                    </button>
                    {!reviewed && canReview && (
                      <button
                        onClick={() => void markReviewed(override.id)}
                        className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/20 border border-success/30"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Marcar como revisado
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    {/* Justificativa */}
                    <div className="rounded-lg bg-card/80 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Justificativa apresentada
                      </p>
                      <p className="mt-1 text-sm text-foreground italic">
                        "{override.justification}"
                      </p>
                    </div>

                    {/* Violations */}
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Violações registradas
                      </p>
                      <div className="space-y-1.5">
                        {override.violations.map((v, idx) => {
                          const empName = empMap.get(v.employeeId) || v.employeeId
                          return (
                            <div
                              key={idx}
                              className={cn(
                                'rounded-lg border p-3 text-sm',
                                v.severity === 'blocking'
                                  ? 'border-destructive/30 bg-destructive/5'
                                  : 'border-warning/30 bg-warning/5',
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <AlertTriangle className={cn(
                                  'h-3.5 w-3.5',
                                  v.severity === 'blocking' ? 'text-destructive' : 'text-warning',
                                )} />
                                <span className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                                  v.severity === 'blocking'
                                    ? 'bg-destructive/15 text-destructive'
                                    : 'bg-warning/15 text-warning',
                                )}>
                                  {v.rule}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {v.date} · {empName}
                                </span>
                              </div>
                              <p className="mt-1 text-foreground">{v.message}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
