import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Users, CheckCircle, Clock, AlertTriangle, Radio, Fingerprint } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useApp } from '@/store/AppContext'
import { useToast } from '@/components/ui/Toast'
import { cn, todayBR } from '@/lib/utils'
import { HOUR_RANGES } from '@/types'
import { api } from '@/lib/api'
import type { PontoRecord } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────

function currentHHMM(): string {
  // Hora atual em America/Sao_Paulo (nunca usar getHours direto)
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

/** Extract HH:MM from an ISO datetime string */
function timeFromISO(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Check if an hour range (e.g. "11:00-12:00") is in the past relative to now */
function isHourPast(range: string): boolean {
  const endHour = range.split('-')[1]
  return currentHHMM() >= endHour
}

/** Check if an hour range is current */
function isHourCurrent(range: string): boolean {
  const [start, end] = range.split('-')
  const now = currentHHMM()
  return now >= start && now < end
}

// ── Component ────────────────────────────────────────────────────────────

export default function DashboardAoVivoPage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [now, setNow] = useState(new Date())
  const [manualCheckin, setManualCheckin] = useState<{ id: string; name: string } | null>(null)
  const [manualReason, setManualReason] = useState('GPS indisponível')
  const [manualLoading, setManualLoading] = useState(false)

  // Single interval: ticks every second for clock; uses a counter for 60s refresh
  useEffect(() => {
    let ticks = 0
    const tick = setInterval(() => {
      ticks++
      setNow(new Date())
      // Every 60 ticks (60s), force a re-render to refresh data
      if (ticks >= 60) ticks = 0
    }, 1_000)
    return () => clearInterval(tick)
  }, [])

  const today = todayBR()

  async function doManualCheckin() {
    if (!manualCheckin) return
    setManualLoading(true)
    try {
      const result = await api.post<{ ok: boolean; record: PontoRecord }>(
        '/api/ponto/manual-checkin',
        { employeeId: manualCheckin.id, date: today, reason: manualReason },
      )
      dispatch({ type: 'ADD_PONTO', payload: result.record })
      toast('success', `Check-in manual de ${manualCheckin.name} registrado.`)
      setManualCheckin(null)
      setManualReason('GPS indisponível')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao registrar check-in')
    } finally {
      setManualLoading(false)
    }
  }

  // Find today's schedule day across all week schedules
  const todaySchedule = useMemo(() => {
    for (const week of state.schedules) {
      const day = week.days.find((d) => d.date === today)
      if (day) return { weekStart: week.weekStart, day }
    }
    return null
  }, [state.schedules, today])

  // Today's ponto records
  const todayPonto = useMemo(
    () => state.pontoRecords.filter((p) => p.date === today),
    [state.pontoRecords, today],
  )

  // Build employee status map
  const employeeMap = useMemo(() => {
    const map = new Map(state.employees.map((e) => [e.id, e]))
    return map
  }, [state.employees])

  // All assigned employee IDs for today (unique)
  const assignedEmployees = useMemo(() => {
    if (!todaySchedule) return []
    const ids = new Set<string>()
    todaySchedule.day.slots.forEach((slot) => {
      slot.assignments.forEach((a) => ids.add(a.employeeId))
    })
    return Array.from(ids)
  }, [todaySchedule])

  // Build per-employee info
  const employeeRows = useMemo(() => {
    return assignedEmployees.map((empId) => {
      const emp = employeeMap.get(empId)
      const ponto = todayPonto.find((p) => p.employeeId === empId)

      // Find scheduled hours for this employee
      const scheduledSlots = todaySchedule?.day.slots.filter((s) =>
        s.assignments.some((a) => a.employeeId === empId),
      ) ?? []
      const scheduledHours = scheduledSlots.map((s) => s.hour)

      let status: 'presente' | 'ausente' | 'atrasado' | 'aguardando' = 'aguardando'
      let checkInTime: string | null = null

      if (ponto) {
        checkInTime = ponto.checkIn ? timeFromISO(ponto.checkIn) : null
        if (ponto.status === 'absent') {
          status = 'ausente'
        } else if (ponto.status === 'late') {
          status = 'atrasado'
        } else if (ponto.checkIn) {
          status = 'presente'
        }
      } else {
        // No ponto record — check if their first slot has already started
        if (scheduledHours.length > 0) {
          const firstSlotStart = scheduledHours[0].split('-')[0]
          if (currentHHMM() > firstSlotStart) {
            status = 'ausente'
          }
        }
      }

      return {
        id: empId,
        name: emp?.nickname || emp?.name || empId,
        scheduledHours: scheduledHours.length > 0
          ? `${scheduledHours[0].split('-')[0]} - ${scheduledHours[scheduledHours.length - 1].split('-')[1]}`
          : '--',
        checkInTime,
        status,
      }
    })
  }, [assignedEmployees, employeeMap, todayPonto, todaySchedule])

  // Metric cards data
  const metrics = useMemo(() => {
    const escalados = assignedEmployees.length
    const presentes = employeeRows.filter((e) => e.status === 'presente').length
    const atrasados = employeeRows.filter((e) => e.status === 'atrasado').length
    const ausentes = employeeRows.filter((e) => e.status === 'ausente').length
    return { escalados, presentes, atrasados, ausentes }
  }, [assignedEmployees, employeeRows])

  // Hour-by-hour timeline data
  const timeline = useMemo(() => {
    if (!todaySchedule) return []

    return HOUR_RANGES.map((range) => {
      const slot = todaySchedule.day.slots.find((s) => s.hour === range)
      const required = slot?.requiredPeople ?? 0
      if (required === 0) return null

      // Count present people in this slot
      const assignedIds = slot?.assignments.map((a) => a.employeeId) ?? []
      const presentCount = assignedIds.filter((id) => {
        const ponto = todayPonto.find((p) => p.employeeId === id)
        return ponto && ponto.checkIn != null && ponto.status !== 'absent'
      }).length

      const isPast = isHourPast(range)
      const isCurrent = isHourCurrent(range)

      let color: 'green' | 'yellow' | 'red' = 'green'
      if (presentCount < required) {
        color = presentCount >= required - 1 ? 'yellow' : 'red'
      }

      return { range, required, present: presentCount, color, isPast, isCurrent }
    }).filter(Boolean) as Array<{
      range: string
      required: number
      present: number
      color: 'green' | 'yellow' | 'red'
      isPast: boolean
      isCurrent: boolean
    }>
  }, [todaySchedule, todayPonto])

  // Projecao: future hours with expected gaps
  const projecao = useMemo(() => {
    if (!todaySchedule) return []

    return HOUR_RANGES.map((range) => {
      const startHour = range.split('-')[0]
      if (currentHHMM() >= startHour) return null // only future

      const slot = todaySchedule.day.slots.find((s) => s.hour === range)
      const required = slot?.requiredPeople ?? 0
      if (required === 0) return null

      const assignedIds = slot?.assignments.map((a) => a.employeeId) ?? []

      // Projected present = assigned who have checked in OR haven't been marked absent yet
      const projectedPresent = assignedIds.filter((id) => {
        const row = employeeRows.find((r) => r.id === id)
        return row && row.status !== 'ausente'
      }).length

      const gap = required - projectedPresent

      return { range, required, projected: projectedPresent, gap }
    }).filter(Boolean) as Array<{
      range: string
      required: number
      projected: number
      gap: number
    }>
  }, [todaySchedule, employeeRows])

  // ── Status badge helpers ────────────────────────────────────────────

  function statusBadge(status: 'presente' | 'ausente' | 'atrasado' | 'aguardando') {
    const config: Record<typeof status, { variant: 'success' | 'destructive' | 'warning' | 'muted'; label: string }> = {
      presente: { variant: 'success', label: 'Presente' },
      ausente: { variant: 'destructive', label: 'Ausente' },
      atrasado: { variant: 'warning', label: 'Atrasado' },
      aguardando: { variant: 'muted', label: 'Aguardando' },
    }
    const c = config[status]
    return <Badge variant={c.variant}>{c.label}</Badge>
  }

  function timelineColor(color: 'green' | 'yellow' | 'red') {
    return {
      green: 'bg-success/20 border-success/40 text-success',
      yellow: 'bg-warning/20 border-warning/40 text-warning',
      red: 'bg-destructive/20 border-destructive/40 text-destructive',
    }[color]
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Dashboard Ao Vivo</h1>
          <span className="flex items-center gap-1.5 text-sm text-success">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            Ao Vivo
          </span>
        </div>
        <div className="text-right">
          <p className="text-3xl font-mono font-bold text-foreground tabular-nums">
            {formatTime(now)}
          </p>
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Section 1: Metric Cards (clicáveis → navegam para detalhe) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate('/escala')}
          className="group rounded-xl border border-border bg-card p-5 text-center transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
        >
          <Users className="mx-auto h-6 w-6 text-primary transition-transform group-hover:scale-110" />
          <p className="mt-2 text-sm text-muted-foreground">Escalados hoje</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{metrics.escalados}</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/ponto')}
          className="group rounded-xl border border-success/30 bg-success/5 p-5 text-center transition-all hover:border-success/60 hover:bg-success/10 active:scale-[0.98]"
        >
          <CheckCircle className="mx-auto h-6 w-6 text-success transition-transform group-hover:scale-110" />
          <p className="mt-2 text-sm text-muted-foreground">Presentes</p>
          <p className="mt-1 text-3xl font-bold text-success">{metrics.presentes}</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/ponto')}
          className="group rounded-xl border border-warning/30 bg-warning/5 p-5 text-center transition-all hover:border-warning/60 hover:bg-warning/10 active:scale-[0.98]"
        >
          <Clock className="mx-auto h-6 w-6 text-warning transition-transform group-hover:scale-110" />
          <p className="mt-2 text-sm text-muted-foreground">Atrasados</p>
          <p className="mt-1 text-3xl font-bold text-warning">{metrics.atrasados}</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/ponto')}
          className="group rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center transition-all hover:border-destructive/60 hover:bg-destructive/10 active:scale-[0.98]"
        >
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive transition-transform group-hover:scale-110" />
          <p className="mt-2 text-sm text-muted-foreground">Ausentes</p>
          <p className="mt-1 text-3xl font-bold text-destructive">{metrics.ausentes}</p>
        </button>
      </div>

      {/* Section 2: Hour-by-hour Timeline */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Radio className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Timeline Hora a Hora</h2>
        </div>
        {timeline.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma escala encontrada para hoje.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {timeline.map((t) => (
              <div
                key={t.range}
                className={cn(
                  'rounded-lg border p-3 text-center transition-all',
                  timelineColor(t.color),
                  t.isCurrent && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                  t.isPast && 'opacity-50',
                )}
              >
                <p className="text-xs font-medium opacity-80">{t.range}</p>
                <p className="text-lg font-bold mt-1">
                  {t.present}/{t.required}
                </p>
                <p className="text-[10px] uppercase tracking-wider mt-0.5">
                  {t.color === 'green' ? 'OK' : t.color === 'yellow' ? 'Justo' : 'Deficit'}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-success" /> Coberto
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-warning" /> Justo
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Deficit
          </span>
        </div>
      </Card>

      {/* Section 3: Employee List */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Colaboradores</h2>
          <Badge variant="muted" size="sm">{assignedEmployees.length}</Badge>
        </div>
        {employeeRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum colaborador escalado hoje.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Nome</th>
                  <th className="text-left py-2 px-3 font-medium">Horario</th>
                  <th className="text-left py-2 px-3 font-medium">Check-in</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {employeeRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground">{row.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground font-mono text-xs">{row.scheduledHours}</td>
                    <td className="py-2.5 px-3 text-muted-foreground font-mono text-xs">
                      {row.checkInTime ?? '--:--'}
                    </td>
                    <td className="py-2.5 px-3">{statusBadge(row.status)}</td>
                    <td className="py-2.5 px-3">
                      {(row.status === 'ausente' || row.status === 'aguardando') && (
                        <button
                          onClick={() => setManualCheckin({ id: row.id, name: row.name })}
                          className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
                          title="Registrar check-in manual (GPS falhou)"
                        >
                          <Fingerprint className="h-3 w-3" />
                          Manual
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 4: Projecao */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <h2 className="text-lg font-semibold text-foreground">Projecao - Proximas Horas</h2>
        </div>
        {projecao.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sem horarios futuros com escala hoje.</p>
        ) : (
          <div className="space-y-2">
            {projecao.map((p) => (
              <div
                key={p.range}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-4 py-3',
                  p.gap > 0
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-border bg-card',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-foreground">{p.range}</span>
                  <span className="text-xs text-muted-foreground">
                    Necessario: {p.required} | Projecao: {p.projected}
                  </span>
                </div>
                {p.gap > 0 ? (
                  <Badge variant="destructive">
                    -{p.gap} {p.gap === 1 ? 'pessoa' : 'pessoas'}
                  </Badge>
                ) : (
                  <Badge variant="success">Coberto</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Auto-refresh indicator */}
      <p className="text-center text-xs text-muted-foreground">
        Atualizacao automatica a cada 60 segundos
      </p>

      {/* ─── Modal check-in manual ──────────────────────────────── */}
      {manualCheckin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setManualCheckin(null)}
        >
          <div
            className="glass-strong mx-4 w-full max-w-sm rounded-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Fingerprint className="h-6 w-6 text-primary" />
              <div>
                <h3 className="text-base font-bold text-foreground">Check-in Manual</h3>
                <p className="text-xs text-muted-foreground">{manualCheckin.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Registra a presença agora ({new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}) sem GPS. O motivo ficará no histórico.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Motivo</label>
              <input
                type="text"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="GPS indisponível"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setManualCheckin(null)}
                className="flex-1 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80"
              >
                Cancelar
              </button>
              <button
                onClick={doManualCheckin}
                disabled={manualLoading}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {manualLoading ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
