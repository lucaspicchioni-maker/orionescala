import { useState, useEffect, useMemo } from 'react'
import { Bell, CheckCircle, XCircle, Clock, RefreshCw, Users, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { MetricCard } from '@/components/ui/MetricCard'
import { useApp } from '@/store/AppContext'
import { api, hasToken } from '@/lib/api'

interface ConvocationItem {
  id: string
  employeeId: string
  employeeName: string
  weekStart: string
  shiftDate: string
  shiftStart: string
  shiftEnd: string
  status: string
  deadline: string
  respondedAt: string | null
  response: string | null
  presenceDeadline: string | null
  presenceResponse: string | null
  noshowFine: number
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'muted' }> = {
  pending: { label: 'Pendente', variant: 'warning' },
  confirmed: { label: 'Confirmado', variant: 'success' },
  declined: { label: 'Recusado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'muted' },
  present: { label: 'Presente', variant: 'success' },
  absent: { label: 'Ausente', variant: 'destructive' },
}

export default function ConvocacoesPage() {
  const { state } = useApp()
  const [weekStart, setWeekStart] = useState(state.currentWeek)
  const [convocations, setConvocations] = useState<ConvocationItem[]>([])
  const [loading, setLoading] = useState(false)

  async function loadConvocations() {
    if (!hasToken()) return
    setLoading(true)
    try {
      const data = await api.get<ConvocationItem[]>(`/api/convocations/${weekStart}`)
      setConvocations(data)
    } catch {
      // API may not be available
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConvocations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  const stats = useMemo(() => {
    const total = convocations.length
    const confirmed = convocations.filter(c => c.status === 'confirmed' || c.status === 'present').length
    const declined = convocations.filter(c => c.status === 'declined').length
    const pending = convocations.filter(c => c.status === 'pending').length
    const expired = convocations.filter(c => c.status === 'expired').length
    const absent = convocations.filter(c => c.status === 'absent').length
    const pctConfirmed = total > 0 ? Math.round((confirmed / total) * 100) : 0
    return { total, confirmed, declined, pending, expired, absent, pctConfirmed }
  }, [convocations])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, ConvocationItem[]>()
    for (const c of convocations) {
      const list = map.get(c.shiftDate) || []
      list.push(c)
      map.set(c.shiftDate, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [convocations])

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Convocacoes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status das convocacoes CLT intermitente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <button
            onClick={loadConvocations}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total Convocados" value={stats.total} icon={Users} />
        <MetricCard label="Confirmados" value={stats.pctConfirmed} unit="%" icon={CheckCircle} trend={stats.pctConfirmed >= 80 ? 'up' : 'down'} />
        <MetricCard label="Pendentes" value={stats.pending} icon={Clock} trend={stats.pending > 0 ? 'down' : 'stable'} />
        <MetricCard label="Ausentes" value={stats.absent} icon={XCircle} trend={stats.absent > 0 ? 'down' : 'up'} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && convocations.length === 0 && (
        <Card variant="glass">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nenhuma convocacao encontrada para esta semana.
            </p>
            <p className="text-xs text-muted-foreground">
              Publique uma escala para gerar convocacoes automaticas.
            </p>
          </div>
        </Card>
      )}

      {/* Convocations by day */}
      {grouped.map(([date, items]) => (
        <Card key={date}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {formatDate(date)}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2">Colaborador</th>
                  <th className="px-2 py-2">Turno</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Prazo</th>
                  <th className="px-2 py-2 text-right">Multa</th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => {
                  const cfg = STATUS_CONFIG[c.status] || { label: c.status, variant: 'muted' as const }
                  return (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-2 py-2.5 font-medium text-foreground">{c.employeeName}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{c.shiftStart} - {c.shiftEnd}</td>
                      <td className="px-2 py-2.5">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">
                        {c.deadline ? new Date(c.deadline).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {c.noshowFine > 0 ? (
                          <span className="text-destructive font-medium">
                            R$ {c.noshowFine.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {/* Legend */}
      {convocations.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium">Legenda:</span>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1">
              <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
