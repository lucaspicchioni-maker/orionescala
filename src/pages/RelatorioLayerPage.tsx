import { useState, useMemo } from 'react'
import { useApp } from '@/store/AppContext'
import { evaluateRules } from '@/services/rulesEngine'
import type { RuleLayer } from '@/types'
import {
  Shield,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ThumbsUp,
  ThumbsDown,
  Users,
  Clock,
  Zap,
  Target,
  TrendingUp,
  UserMinus,
  FileDown,
  Activity,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────

function getWeekStart(offset: number): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7
  const monday = new Date(now.getFullYear(), now.getMonth(), diff)
  return monday.toISOString().split('T')[0]
}

function getWeekDates(weekStart: string): string[] {
  const d = new Date(weekStart + 'T00:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(d)
    date.setDate(d.getDate() + i)
    return date.toISOString().split('T')[0]
  })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

const LAYER_CONFIG: Record<RuleLayer | 'rh', {
  label: string
  color: string
  bgColor: string
  icon: typeof Shield
  description: string
}> = {
  expeditor: {
    label: 'Expeditor',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    icon: Clock,
    description: 'Pontualidade, presenca e erros operacionais',
  },
  supervisor: {
    label: 'Supervisor',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    icon: Users,
    description: 'Cobertura de escala, equipe e banco de horas',
  },
  gerente: {
    label: 'Gerente',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
    icon: TrendingUp,
    description: 'Produtividade, SLA, erros e custos',
  },
  global: {
    label: 'Global',
    color: 'text-foreground',
    bgColor: 'bg-muted/50',
    icon: Shield,
    description: 'Regras transversais',
  },
  rh: {
    label: 'RH',
    color: 'text-success',
    bgColor: 'bg-success/10',
    icon: Activity,
    description: 'Quadro de pessoal, absenteismo, contratacao',
  },
}

type SelectedLayer = RuleLayer | 'rh'

export default function RelatorioLayerPage() {
  const { state } = useApp()
  const [weekOffset, setWeekOffset] = useState(0)
  const role = state.currentUser.role
  const defaultLayer: SelectedLayer =
    role === 'rh' ? 'rh' : role === 'gerente' || role === 'admin' ? 'gerente' : role === 'supervisor' ? 'supervisor' : 'expeditor'
  const [selectedLayer, setSelectedLayer] = useState<SelectedLayer>(defaultLayer)

  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset])
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  const { violations, highlights } = useMemo(
    () => evaluateRules(state, weekStart),
    [state, weekStart],
  )

  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    state.employees.forEach(e => { m[e.id] = e.nickname || e.name })
    return m
  }, [state.employees])

  // Layer-filtered data
  const layerViolations = violations.filter(v =>
    selectedLayer === 'rh' ? true : v.layer === selectedLayer || v.layer === 'global',
  )
  const layerHighlights = highlights.filter(h =>
    selectedLayer === 'rh' ? true : h.layer === selectedLayer || h.layer === 'global',
  )
  const positives = layerHighlights.filter(h => h.type === 'positive')
  const negatives = layerHighlights.filter(h => h.type === 'negative')

  // Layer-specific computed data
  const layerMetrics = useMemo(() => {
    const weekPonto = state.pontoRecords.filter(p => {
      const d = new Date(p.date)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const ws = new Date(new Date(p.date + 'T00:00:00').setDate(diff)).toISOString().split('T')[0]
      return ws === weekStart
    })
    const weekProd = state.productivityRecords.filter(r => r.weekStart === weekStart)
    const activeEmps = state.employees.filter(e => e.status === 'ativo')
    const schedule = state.schedules.find(s => s.weekStart === weekStart)

    // Expeditor metrics
    const totalCheckIns = weekPonto.length
    const onTime = weekPonto.filter(p => p.status === 'on_time').length
    const lates = weekPonto.filter(p => p.lateMinutes > 5).length
    const absences = weekPonto.filter(p => p.status === 'absent').length
    const punctualityRate = totalCheckIns > 0 ? Math.round((onTime / totalCheckIns) * 100) : 0
    const absenteeismRate = totalCheckIns > 0 ? Math.round((absences / totalCheckIns) * 100 * 10) / 10 : 0

    // Per-employee late ranking
    const empLates: Record<string, number> = {}
    const empAbsences: Record<string, number> = {}
    weekPonto.forEach(p => {
      if (p.lateMinutes > 5) empLates[p.employeeId] = (empLates[p.employeeId] || 0) + 1
      if (p.status === 'absent') empAbsences[p.employeeId] = (empAbsences[p.employeeId] || 0) + 1
    })

    // Supervisor metrics
    let unfilledSlots = 0
    let totalSlots = 0
    if (schedule) {
      for (const day of schedule.days) {
        for (const slot of day.slots) {
          if (slot.requiredPeople > 0) {
            totalSlots++
            if (slot.assignments.length < slot.requiredPeople) {
              unfilledSlots += (slot.requiredPeople - slot.assignments.length)
            }
          }
        }
      }
    }
    const coverageRate = totalSlots > 0 ? Math.round(((totalSlots - unfilledSlots) / totalSlots) * 100) : 0

    // Banco de horas
    const weekBanco = state.bancoHoras.filter(b => b.weekStart === weekStart)
    const totalOvertime = weekBanco.filter(b => b.balanceMinutes > 0).reduce((s, b) => s + b.balanceMinutes, 0)
    const totalDeficit = weekBanco.filter(b => b.balanceMinutes < 0).reduce((s, b) => s + Math.abs(b.balanceMinutes), 0)

    // Gerente metrics
    const totalOrders = weekProd.reduce((s, r) => s + r.totalOrders, 0)
    const totalErrors = weekProd.reduce((s, r) => s + r.totalErrors, 0)
    const totalErrorCost = weekProd.reduce((s, r) => s + r.errorCost, 0)
    const totalHours = weekProd.reduce((s, r) => s + r.hoursWorked, 0)
    const avgProductivity = totalHours > 0 ? totalOrders / totalHours : 0
    const avgSla = weekProd.length > 0 ? weekProd.reduce((s, r) => s + r.slaCompliance, 0) / weekProd.length : 0
    const errorRate = totalOrders > 0 ? (totalErrors / totalOrders) * 100 : 0
    const avgExpedition = weekProd.length > 0 ? weekProd.reduce((s, r) => s + r.avgExpeditionTime, 0) / weekProd.length : 0

    // RH metrics
    const onVacation = state.employees.filter(e => e.status === 'ferias').length
    const inactive = state.employees.filter(e => e.status === 'inativo').length
    const feedbackCount = state.feedbacks.filter(f => f.weekStart === weekStart).length
    const avgFeedback = feedbackCount > 0
      ? state.feedbacks.filter(f => f.weekStart === weekStart).reduce((s, f) => {
        return s + (f.scores.proatividade + f.scores.trabalhoEquipe + f.scores.comunicacao + f.scores.qualidade + f.scores.pontualidade) / 5
      }, 0) / feedbackCount
      : 0

    return {
      // Expeditor
      totalCheckIns, onTime, lates, absences, punctualityRate, absenteeismRate, empLates, empAbsences,
      // Supervisor
      unfilledSlots, totalSlots, coverageRate, totalOvertime, totalDeficit,
      // Gerente
      totalOrders, totalErrors, totalErrorCost, totalHours, avgProductivity, avgSla, errorRate, avgExpedition,
      // RH
      activeCount: activeEmps.length, onVacation, inactive, feedbackCount, avgFeedback,
    }
  }, [state, weekStart])

  // CSV export for current layer report
  function exportLayerCSV() {
    const headers: string[] = []
    const rows: string[][] = []

    if (selectedLayer === 'expeditor') {
      headers.push('Indicador', 'Valor')
      rows.push(['Check-ins', String(layerMetrics.totalCheckIns)])
      rows.push(['No horario', String(layerMetrics.onTime)])
      rows.push(['Atrasos', String(layerMetrics.lates)])
      rows.push(['Faltas', String(layerMetrics.absences)])
      rows.push(['Pontualidade %', `${layerMetrics.punctualityRate}%`])
      rows.push(['Absenteismo %', `${layerMetrics.absenteeismRate}%`])
      rows.push(['', ''])
      rows.push(['Violacoes', ''])
      layerViolations.forEach(v => rows.push([v.description, `${v.value} ${v.unit}`]))
    } else if (selectedLayer === 'supervisor') {
      headers.push('Indicador', 'Valor')
      rows.push(['Vagas abertas', String(layerMetrics.unfilledSlots)])
      rows.push(['Cobertura escala %', `${layerMetrics.coverageRate}%`])
      rows.push(['Horas extras (min)', String(layerMetrics.totalOvertime)])
      rows.push(['Deficit horas (min)', String(layerMetrics.totalDeficit)])
      rows.push(['', ''])
      rows.push(['Violacoes', ''])
      layerViolations.forEach(v => rows.push([v.description, `${v.value} ${v.unit}`]))
    } else if (selectedLayer === 'gerente') {
      headers.push('Indicador', 'Valor')
      rows.push(['Pedidos', String(layerMetrics.totalOrders)])
      rows.push(['Erros', String(layerMetrics.totalErrors)])
      rows.push(['Custo reembolso R$', String(layerMetrics.totalErrorCost.toFixed(2))])
      rows.push(['Produtividade ped/h', layerMetrics.avgProductivity.toFixed(1)])
      rows.push(['SLA %', layerMetrics.avgSla.toFixed(1)])
      rows.push(['Taxa erro %', layerMetrics.errorRate.toFixed(1)])
      rows.push(['', ''])
      rows.push(['Violacoes', ''])
      layerViolations.forEach(v => rows.push([v.description, `${v.value} ${v.unit}`]))
    } else {
      headers.push('Indicador', 'Valor')
      rows.push(['Ativos', String(layerMetrics.activeCount)])
      rows.push(['Ferias', String(layerMetrics.onVacation)])
      rows.push(['Inativos', String(layerMetrics.inactive)])
      rows.push(['Absenteismo %', `${layerMetrics.absenteeismRate}%`])
      rows.push(['Avaliacoes', String(layerMetrics.feedbackCount)])
      rows.push(['Media avaliacao', layerMetrics.avgFeedback.toFixed(1)])
      rows.push(['', ''])
      rows.push(['Todas violacoes', ''])
      violations.forEach(v => rows.push([v.description, `${v.value} ${v.unit}`]))
    }

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${selectedLayer}_${weekStart}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cfg = LAYER_CONFIG[selectedLayer]
  const LayerIcon = cfg.icon

  function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-center">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-2xl font-bold ${color || 'text-foreground'}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Shield className="h-5 w-5 text-primary" />
            Relatorio Analitico por Layer
          </h2>
          <p className="text-sm text-muted-foreground">Gerado automaticamente a partir das Regras de Ouro</p>
        </div>
        <button
          onClick={exportLayerCSV}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FileDown className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      {/* Week selector */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
        <button onClick={() => setWeekOffset(o => o - 1)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{formatDateShort(weekDates[0])} — {formatDateShort(weekDates[6])}</span>
          {weekOffset === 0 && <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">Atual</span>}
        </div>
        <button onClick={() => setWeekOffset(o => o + 1)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Layer tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
        {(['expeditor', 'supervisor', 'gerente', 'rh'] as SelectedLayer[]).map(layer => {
          const lc = LAYER_CONFIG[layer]
          const LIcon = lc.icon
          return (
            <button
              key={layer}
              onClick={() => setSelectedLayer(layer)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-all ${
                selectedLayer === layer
                  ? 'bg-card shadow-sm ' + lc.color
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LIcon className="h-3.5 w-3.5" />
              {lc.label}
            </button>
          )
        })}
      </div>

      {/* Layer info */}
      <div className={`rounded-xl ${cfg.bgColor} p-4`}>
        <div className="flex items-center gap-3">
          <LayerIcon className={`h-6 w-6 ${cfg.color}`} />
          <div>
            <h3 className={`font-bold ${cfg.color}`}>{cfg.label}</h3>
            <p className="text-xs text-muted-foreground">{cfg.description}</p>
          </div>
        </div>
      </div>

      {/* ══ EXPEDITOR REPORT ══ */}
      {selectedLayer === 'expeditor' && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Check-ins" value={layerMetrics.totalCheckIns} />
            <MetricCard label="No Horario" value={layerMetrics.onTime} color="text-success" />
            <MetricCard label="Atrasos" value={layerMetrics.lates} color={layerMetrics.lates > 0 ? 'text-warning' : 'text-success'} />
            <MetricCard label="Faltas" value={layerMetrics.absences} color={layerMetrics.absences > 0 ? 'text-destructive' : 'text-success'} />
            <MetricCard label="Pontualidade" value={`${layerMetrics.punctualityRate}%`} color={layerMetrics.punctualityRate >= 90 ? 'text-success' : 'text-warning'} />
            <MetricCard label="Absenteismo" value={`${layerMetrics.absenteeismRate}%`} color={layerMetrics.absenteeismRate <= 5 ? 'text-success' : 'text-destructive'} />
          </div>

          {/* Top late + absent employees */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-warning uppercase">
                <Clock className="h-4 w-4" /> Maiores Atrasados
              </h4>
              {Object.keys(layerMetrics.empLates).length === 0 ? (
                <p className="text-xs text-success flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Todos pontuais!</p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(layerMetrics.empLates).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => (
                    <div key={id} className="flex justify-between rounded-lg bg-warning/5 px-3 py-1.5 text-xs">
                      <span className="text-foreground">{empMap[id] || id}</span>
                      <span className="font-bold text-warning">{count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-destructive uppercase">
                <UserMinus className="h-4 w-4" /> Maiores Faltantes
              </h4>
              {Object.keys(layerMetrics.empAbsences).length === 0 ? (
                <p className="text-xs text-success flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Zero faltas!</p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(layerMetrics.empAbsences).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => (
                    <div key={id} className="flex justify-between rounded-lg bg-destructive/5 px-3 py-1.5 text-xs">
                      <span className="text-foreground">{empMap[id] || id}</span>
                      <span className="font-bold text-destructive">{count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Verdict */}
          <VerdictCard
            positives={positives.length}
            negatives={negatives.length}
            violations={layerViolations.length}
            layer="expeditor"
          />
        </>
      )}

      {/* ══ SUPERVISOR REPORT ══ */}
      {selectedLayer === 'supervisor' && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="Vagas Abertas" value={layerMetrics.unfilledSlots} color={layerMetrics.unfilledSlots > 0 ? 'text-destructive' : 'text-success'} />
            <MetricCard label="Cobertura Escala" value={`${layerMetrics.coverageRate}%`} color={layerMetrics.coverageRate >= 95 ? 'text-success' : 'text-warning'} />
            <MetricCard label="Horas Extras" value={`${Math.round(layerMetrics.totalOvertime / 60)}h`} sub={`${layerMetrics.totalOvertime}min total`} color="text-warning" />
            <MetricCard label="Deficit Horas" value={`${Math.round(layerMetrics.totalDeficit / 60)}h`} sub={`${layerMetrics.totalDeficit}min total`} color={layerMetrics.totalDeficit > 0 ? 'text-destructive' : 'text-success'} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard label="Check-ins" value={layerMetrics.totalCheckIns} />
            <MetricCard label="Atrasos" value={layerMetrics.lates} color={layerMetrics.lates > 0 ? 'text-warning' : 'text-success'} />
            <MetricCard label="Faltas" value={layerMetrics.absences} color={layerMetrics.absences > 0 ? 'text-destructive' : 'text-success'} />
          </div>

          <VerdictCard
            positives={positives.length}
            negatives={negatives.length}
            violations={layerViolations.length}
            layer="supervisor"
          />
        </>
      )}

      {/* ══ GERENTE REPORT ══ */}
      {selectedLayer === 'gerente' && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Pedidos" value={layerMetrics.totalOrders} />
            <MetricCard label="Produtividade" value={`${layerMetrics.avgProductivity.toFixed(1)}`} sub="ped/hora" color="text-primary" />
            <MetricCard label="SLA" value={`${layerMetrics.avgSla.toFixed(1)}%`} color={layerMetrics.avgSla >= 95 ? 'text-success' : 'text-warning'} />
            <MetricCard label="Erros" value={layerMetrics.totalErrors} color={layerMetrics.totalErrors > 0 ? 'text-destructive' : 'text-success'} />
            <MetricCard label="Custo Reembolso" value={`R$${layerMetrics.totalErrorCost.toFixed(0)}`} color="text-destructive" />
            <MetricCard label="Taxa Erro" value={`${layerMetrics.errorRate.toFixed(1)}%`} color={layerMetrics.errorRate > 5 ? 'text-destructive' : 'text-success'} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard label="Horas Trabalhadas" value={`${layerMetrics.totalHours.toFixed(0)}h`} />
            <MetricCard label="Tempo Expedicao" value={`${layerMetrics.avgExpedition > 0 ? Math.round(layerMetrics.avgExpedition) : '-'}s`} sub="media por pedido" />
            <MetricCard label="Absenteismo" value={`${layerMetrics.absenteeismRate}%`} color={layerMetrics.absenteeismRate <= 5 ? 'text-success' : 'text-destructive'} />
          </div>

          <VerdictCard
            positives={positives.length}
            negatives={negatives.length}
            violations={layerViolations.length}
            layer="gerente"
          />
        </>
      )}

      {/* ══ RH REPORT ══ */}
      {selectedLayer === 'rh' && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="Ativos" value={layerMetrics.activeCount} color="text-success" />
            <MetricCard label="Ferias" value={layerMetrics.onVacation} color="text-primary" />
            <MetricCard label="Inativos" value={layerMetrics.inactive} color="text-muted-foreground" />
            <MetricCard label="Avaliacoes" value={layerMetrics.feedbackCount} sub="esta semana" />
            <MetricCard label="Nota Media" value={layerMetrics.avgFeedback > 0 ? layerMetrics.avgFeedback.toFixed(1) : '-'} sub="de 5.0" color="text-primary" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="Absenteismo" value={`${layerMetrics.absenteeismRate}%`} color={layerMetrics.absenteeismRate <= 5 ? 'text-success' : 'text-destructive'} />
            <MetricCard label="Cobertura Escala" value={`${layerMetrics.coverageRate}%`} color={layerMetrics.coverageRate >= 95 ? 'text-success' : 'text-warning'} />
            <MetricCard label="Vagas Abertas" value={layerMetrics.unfilledSlots} color={layerMetrics.unfilledSlots > 0 ? 'text-destructive' : 'text-success'} />
            <MetricCard label="Horas Extras" value={`${Math.round(layerMetrics.totalOvertime / 60)}h`} color="text-warning" />
          </div>

          <VerdictCard
            positives={positives.length}
            negatives={negatives.length}
            violations={violations.length}
            layer="rh"
          />
        </>
      )}

      {/* ══ HIGHLIGHTS ══ */}
      {(positives.length > 0 || negatives.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {positives.length > 0 && (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-success">
                <ThumbsUp className="h-4 w-4" /> Destaques Positivos
              </div>
              {positives.map((h, i) => (
                <div key={i} className="rounded-lg bg-success/10 px-3 py-2">
                  <div className="text-xs font-medium text-foreground">{h.title}</div>
                  <div className="text-[11px] text-muted-foreground">{h.description}</div>
                  {h.metric !== undefined && (
                    <div className="mt-0.5 text-xs font-bold text-success">{h.metric}{h.unit ? ` ${h.unit}` : ''}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {negatives.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <ThumbsDown className="h-4 w-4" /> Pontos de Atencao
              </div>
              {negatives.map((h, i) => (
                <div key={i} className="rounded-lg bg-destructive/10 px-3 py-2">
                  <div className="text-xs font-medium text-foreground">{h.title}</div>
                  <div className="text-[11px] text-muted-foreground">{h.description}</div>
                  {h.metric !== undefined && (
                    <div className="mt-0.5 text-xs font-bold text-destructive">{h.metric}{h.unit ? ` ${h.unit}` : ''}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ VIOLATIONS ══ */}
      {layerViolations.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" /> {layerViolations.length} Violacao(es) de Regras de Ouro
          </div>
          {layerViolations.map(v => (
            <div key={v.id} className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs">
              <span className={`mt-0.5 ${v.severity === 'bloqueante' ? 'text-destructive' : 'text-warning'}`}>
                {v.severity === 'bloqueante' ? <AlertTriangle className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
              </span>
              <div className="flex-1">
                <span className="font-medium text-foreground">{v.description}</span>
                <div className="mt-0.5 flex gap-2">
                  <span className="text-muted-foreground">{v.ruleName}</span>
                  <span className={`font-semibold ${v.severity === 'bloqueante' ? 'text-destructive' : 'text-warning'}`}>
                    {v.severity}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No data */}
      {layerMetrics.totalCheckIns === 0 && layerMetrics.totalOrders === 0 && layerViolations.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Target className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 font-medium text-foreground">Sem dados para esta semana</p>
          <p className="mt-1 text-sm text-muted-foreground">Lance dados de ponto e produtividade para ver o relatorio.</p>
        </div>
      )}
    </div>
  )
}

// ── Verdict Component ─────────────────────────────────────────────────

function VerdictCard({ positives, negatives, violations, layer }: {
  positives: number; negatives: number; violations: number; layer: string
}) {
  const score = positives * 2 - negatives - violations * 3
  const isGood = violations === 0 && negatives <= 1
  const isOk = violations <= 2 && negatives <= 3
  const verdict = isGood ? 'Excelente' : isOk ? 'Atencao' : 'Critico'
  const color = isGood ? 'text-success' : isOk ? 'text-warning' : 'text-destructive'
  const bg = isGood ? 'bg-success/10 border-success/30' : isOk ? 'bg-warning/10 border-warning/30' : 'bg-destructive/10 border-destructive/30'

  const verdictMessages: Record<string, Record<string, string>> = {
    expeditor: {
      Excelente: 'Equipe pontual e presente. Nenhuma ocorrencia grave.',
      Atencao: 'Ha atrasos ou faltas que precisam ser acompanhados.',
      Critico: 'Multiplas violacoes de presenca. Acao imediata necessaria.',
    },
    supervisor: {
      Excelente: 'Escala completa e banco de horas equilibrado.',
      Atencao: 'Ha gaps na escala ou desbalanco de horas.',
      Critico: 'Escala com buracos criticos. Realocar urgentemente.',
    },
    gerente: {
      Excelente: 'Produtividade e SLA dentro das metas. Custos controlados.',
      Atencao: 'Alguns indicadores fora da meta. Monitorar de perto.',
      Critico: 'Indicadores criticos de produtividade ou SLA. Reuniao de alinhamento necessaria.',
    },
    rh: {
      Excelente: 'Quadro de pessoal saudavel. Baixo absenteismo.',
      Atencao: 'Absenteismo ou gaps de escala requerem analise.',
      Critico: 'Necessidade urgente de contratacao ou intervencao.',
    },
  }

  return (
    <div className={`rounded-xl border-2 ${bg} p-4`}>
      <div className="flex items-center gap-3">
        {isGood ? <CheckCircle className={`h-6 w-6 ${color}`} /> : <AlertTriangle className={`h-6 w-6 ${color}`} />}
        <div>
          <h3 className={`font-bold ${color}`}>Veredito: {verdict}</h3>
          <p className="text-xs text-muted-foreground">
            {verdictMessages[layer]?.[verdict] || 'Analise os indicadores acima.'}
          </p>
        </div>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <div><span className="text-success font-medium">{positives}</span> positivos</div>
          <div><span className="text-destructive font-medium">{negatives}</span> negativos</div>
          <div><span className="text-warning font-medium">{violations}</span> violacoes</div>
        </div>
      </div>
    </div>
  )
}
