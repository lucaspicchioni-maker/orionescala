import { useState, useMemo, useCallback } from 'react'
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
  Target,
  TrendingUp,
  UserMinus,
  FileDown,
  Activity,
  LayoutDashboard,
  ArrowRight,
  Zap,
  Package,
  BarChart2,
  Info,
} from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'

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
  borderColor: string
  icon: typeof Shield
  description: string
}> = {
  expeditor: {
    label: 'Expeditor',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    icon: Clock,
    description: 'Pontualidade, presenca e erros operacionais',
  },
  supervisor: {
    label: 'Supervisor',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    icon: Users,
    description: 'Cobertura de escala, equipe e banco de horas',
  },
  gerente: {
    label: 'Gerente',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
    borderColor: 'border-accent/30',
    icon: TrendingUp,
    description: 'Produtividade, SLA, erros e custos',
  },
  global: {
    label: 'Global',
    color: 'text-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-border',
    icon: Shield,
    description: 'Regras transversais',
  },
  rh: {
    label: 'RH',
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    icon: Activity,
    description: 'Quadro de pessoal, absenteismo, contratacao',
  },
}

type SelectedLayer = RuleLayer | 'rh' | 'geral'

function computeVerdict(violations: number, negatives: number): { verdict: string; isGood: boolean; isOk: boolean } {
  const isGood = violations === 0 && negatives <= 1
  const isOk = violations <= 2 && negatives <= 3
  return { verdict: isGood ? 'Excelente' : isOk ? 'Atencao' : 'Critico', isGood, isOk }
}

export default function RelatorioLayerPage() {
  const { state } = useApp()
  const [weekOffset, setWeekOffset] = useState(0)
  const role = state.currentUser.role
  const defaultLayer: SelectedLayer = 'geral'
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

  // Per-layer violation/highlight buckets
  const byLayer = useMemo(() => {
    const layers = ['expeditor', 'supervisor', 'gerente', 'rh'] as const
    return Object.fromEntries(layers.map(layer => {
      const v = violations.filter(x => layer === 'rh' ? true : x.layer === layer || x.layer === 'global')
      const h = highlights.filter(x => layer === 'rh' ? true : x.layer === layer || x.layer === 'global')
      return [layer, { violations: v, positives: h.filter(x => x.type === 'positive'), negatives: h.filter(x => x.type === 'negative') }]
    }))
  }, [violations, highlights])

  // Active layer filtered data
  const layerViolations = selectedLayer === 'geral' ? violations : byLayer[selectedLayer as keyof typeof byLayer]?.violations ?? []
  const layerHighlights = selectedLayer === 'geral' ? highlights : [...(byLayer[selectedLayer as keyof typeof byLayer]?.positives ?? []), ...(byLayer[selectedLayer as keyof typeof byLayer]?.negatives ?? [])]
  const positives = layerHighlights.filter(h => h.type === 'positive')
  const negatives = layerHighlights.filter(h => h.type === 'negative')

  // All metrics computation
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

    const totalCheckIns = weekPonto.length
    const onTime = weekPonto.filter(p => p.status === 'on_time').length
    const lates = weekPonto.filter(p => p.lateMinutes > 5).length
    const absences = weekPonto.filter(p => p.status === 'absent').length
    const punctualityRate = totalCheckIns > 0 ? Math.round((onTime / totalCheckIns) * 100) : 0
    const absenteeismRate = totalCheckIns > 0 ? Math.round((absences / totalCheckIns) * 100 * 10) / 10 : 0

    const empLates: Record<string, number> = {}
    const empAbsences: Record<string, number> = {}
    weekPonto.forEach(p => {
      if (p.lateMinutes > 5) empLates[p.employeeId] = (empLates[p.employeeId] || 0) + 1
      if (p.status === 'absent') empAbsences[p.employeeId] = (empAbsences[p.employeeId] || 0) + 1
    })

    let unfilledSlots = 0; let totalSlots = 0
    if (schedule) {
      for (const day of schedule.days) {
        for (const slot of day.slots) {
          if (slot.requiredPeople > 0) {
            totalSlots++
            if (slot.assignments.length < slot.requiredPeople) unfilledSlots += (slot.requiredPeople - slot.assignments.length)
          }
        }
      }
    }
    const coverageRate = totalSlots > 0 ? Math.round(((totalSlots - unfilledSlots) / totalSlots) * 100) : 0

    const weekBanco = state.bancoHoras.filter(b => b.weekStart === weekStart)
    const totalOvertime = weekBanco.filter(b => b.balanceMinutes > 0).reduce((s, b) => s + b.balanceMinutes, 0)
    const totalDeficit = weekBanco.filter(b => b.balanceMinutes < 0).reduce((s, b) => s + Math.abs(b.balanceMinutes), 0)

    const totalOrders = weekProd.reduce((s, r) => s + r.totalOrders, 0)
    const totalErrors = weekProd.reduce((s, r) => s + r.totalErrors, 0)
    const totalErrorCost = weekProd.reduce((s, r) => s + r.errorCost, 0)
    const totalHours = weekProd.reduce((s, r) => s + r.hoursWorked, 0)
    const avgProductivity = totalHours > 0 ? totalOrders / totalHours : 0
    const avgSla = weekProd.length > 0 ? weekProd.reduce((s, r) => s + r.slaCompliance, 0) / weekProd.length : 0
    const errorRate = totalOrders > 0 ? (totalErrors / totalOrders) * 100 : 0
    const avgExpedition = weekProd.length > 0 ? weekProd.reduce((s, r) => s + r.avgExpeditionTime, 0) / weekProd.length : 0

    const onVacation = state.employees.filter(e => e.status === 'ferias').length
    const inactive = state.employees.filter(e => e.status === 'inativo').length
    const feedbackCount = state.feedbacks.filter(f => f.weekStart === weekStart).length
    const avgFeedback = feedbackCount > 0
      ? state.feedbacks.filter(f => f.weekStart === weekStart).reduce((s, f) => {
        return s + (f.scores.proatividade + f.scores.trabalhoEquipe + f.scores.comunicacao + f.scores.qualidade + f.scores.pontualidade) / 5
      }, 0) / feedbackCount
      : 0

    return {
      totalCheckIns, onTime, lates, absences, punctualityRate, absenteeismRate, empLates, empAbsences,
      unfilledSlots, totalSlots, coverageRate, totalOvertime, totalDeficit,
      totalOrders, totalErrors, totalErrorCost, totalHours, avgProductivity, avgSla, errorRate, avgExpedition,
      activeCount: activeEmps.length, onVacation, inactive, feedbackCount, avgFeedback,
    }
  }, [state, weekStart])

  // Radar chart data — health score per layer (0-100)
  const radarData = useMemo(() => {
    const score = (value: number, good: number, bad: number, invert = false) => {
      if (invert) {
        if (value <= good) return 100
        if (value >= bad) return 0
        return Math.round(100 - ((value - good) / (bad - good)) * 100)
      } else {
        if (value >= good) return 100
        if (value <= bad) return 0
        return Math.round(((value - bad) / (good - bad)) * 100)
      }
    }
    return [
      { layer: 'Expeditor', score: Math.round((score(layerMetrics.punctualityRate, 95, 70) + score(layerMetrics.absenteeismRate, 0, 15, true)) / 2) },
      { layer: 'Supervisor', score: Math.round((score(layerMetrics.coverageRate, 100, 70) + score(layerMetrics.totalDeficit / 60, 0, 10, true)) / 2) },
      { layer: 'Gerente', score: Math.round((score(layerMetrics.avgSla, 98, 80) + score(layerMetrics.errorRate, 0, 10, true)) / 2) },
      { layer: 'RH', score: Math.round((score(layerMetrics.avgFeedback, 4.5, 2) + score(layerMetrics.absenteeismRate, 0, 15, true)) / 2) },
    ]
  }, [layerMetrics])

  // Violations bar chart data
  const violationsBarData = useMemo(() => [
    { name: 'Expeditor', count: byLayer.expeditor?.violations.length ?? 0, fill: 'hsl(var(--warning))' },
    { name: 'Supervisor', count: byLayer.supervisor?.violations.length ?? 0, fill: 'hsl(var(--primary))' },
    { name: 'Gerente', count: byLayer.gerente?.violations.length ?? 0, fill: 'hsl(var(--accent))' },
    { name: 'RH', count: byLayer.rh?.violations.length ?? 0, fill: 'hsl(var(--success))' },
  ], [byLayer])

  const exportLayerCSV = useCallback(() => {
    const headers: string[] = []
    const rows: string[][] = []

    if (selectedLayer === 'geral') {
      headers.push('Layer', 'Violacoes', 'Positivos', 'Negativos', 'Veredito')
      const layers = ['expeditor', 'supervisor', 'gerente', 'rh'] as const
      layers.forEach(layer => {
        const d = byLayer[layer]
        const { verdict } = computeVerdict(d.violations.length, d.negatives.length)
        rows.push([LAYER_CONFIG[layer].label, String(d.violations.length), String(d.positives.length), String(d.negatives.length), verdict])
      })
    } else if (selectedLayer === 'expeditor') {
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
  }, [selectedLayer, layerMetrics, layerViolations, violations, byLayer, weekStart])

  const cfg = selectedLayer !== 'geral' ? LAYER_CONFIG[selectedLayer as Exclude<SelectedLayer, 'geral'>] : null

  const TABS: { id: SelectedLayer; label: string; icon: typeof Shield }[] = [
    { id: 'geral', label: 'Visao Geral', icon: LayoutDashboard },
    { id: 'expeditor', label: 'Expeditor', icon: Clock },
    { id: 'supervisor', label: 'Supervisor', icon: Users },
    { id: 'gerente', label: 'Gerente', icon: TrendingUp },
    { id: 'rh', label: 'RH', icon: Activity },
  ]

  // Restrict tab visibility by role
  const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'geral') return true
    if (role === 'admin' || role === 'gerente') return true
    if (role === 'rh') return tab.id === 'rh' || tab.id === 'geral'
    if (role === 'supervisor') return tab.id === 'supervisor' || tab.id === 'expeditor'
    return tab.id === 'expeditor'
  })

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
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSelectedLayer(id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-all ${
              selectedLayer === id
                ? id === 'geral'
                  ? 'bg-card shadow-sm text-primary'
                  : `bg-card shadow-sm ${LAYER_CONFIG[id as Exclude<SelectedLayer, 'geral'>].color}`
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ══ VISÃO GERAL ══ */}
      {selectedLayer === 'geral' && (
        <GeralView
          layerMetrics={layerMetrics}
          byLayer={byLayer}
          radarData={radarData}
          violationsBarData={violationsBarData}
          totalViolations={violations.length}
          totalHighlights={highlights.length}
          onSelectLayer={setSelectedLayer}
        />
      )}

      {/* ══ LAYER DETAIL ══ */}
      {selectedLayer !== 'geral' && cfg && (
        <>
          {/* Layer info banner */}
          <div className={`rounded-xl ${cfg.bgColor} p-4`}>
            <div className="flex items-center gap-3">
              <cfg.icon className={`h-6 w-6 ${cfg.color}`} />
              <div>
                <h3 className={`font-bold ${cfg.color}`}>{cfg.label}</h3>
                <p className="text-xs text-muted-foreground">{cfg.description}</p>
              </div>
            </div>
          </div>

          {selectedLayer === 'expeditor' && (
            <ExpeditorView
              metrics={layerMetrics}
              empMap={empMap}
              positives={positives.length}
              negatives={negatives.length}
              violations={layerViolations.length}
            />
          )}

          {selectedLayer === 'supervisor' && (
            <SupervisorView
              metrics={layerMetrics}
              positives={positives.length}
              negatives={negatives.length}
              violations={layerViolations.length}
            />
          )}

          {selectedLayer === 'gerente' && (
            <GerenteView
              metrics={layerMetrics}
              positives={positives.length}
              negatives={negatives.length}
              violations={layerViolations.length}
            />
          )}

          {selectedLayer === 'rh' && (
            <RhView
              metrics={layerMetrics}
              positives={positives.length}
              negatives={negatives.length}
              violations={violations.length}
            />
          )}

          {/* Highlights */}
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

          {/* Violations */}
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

          {layerMetrics.totalCheckIns === 0 && layerMetrics.totalOrders === 0 && layerViolations.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <Target className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 font-medium text-foreground">Sem dados para esta semana</p>
              <p className="mt-1 text-sm text-muted-foreground">Lance dados de ponto e produtividade para ver o relatorio.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Visão Geral (multilayer dashboard) ───────────────────────────────

interface LayerBucket {
  violations: ReturnType<typeof evaluateRules>['violations']
  positives: ReturnType<typeof evaluateRules>['highlights']
  negatives: ReturnType<typeof evaluateRules>['highlights']
}

function GeralView({
  layerMetrics,
  byLayer,
  radarData,
  violationsBarData,
  totalViolations,
  totalHighlights,
  onSelectLayer,
}: {
  layerMetrics: ReturnType<typeof computeLayerMetrics>
  byLayer: Record<string, LayerBucket>
  radarData: { layer: string; score: number }[]
  violationsBarData: { name: string; count: number; fill: string }[]
  totalViolations: number
  totalHighlights: number
  onSelectLayer: (l: SelectedLayer) => void
}) {
  const overallScore = Math.round(radarData.reduce((s, d) => s + d.score, 0) / radarData.length)
  const overallColor = overallScore >= 80 ? 'text-success' : overallScore >= 50 ? 'text-warning' : 'text-destructive'
  const overallBg = overallScore >= 80 ? 'bg-success/10 border-success/30' : overallScore >= 50 ? 'bg-warning/10 border-warning/30' : 'bg-destructive/10 border-destructive/30'

  const LAYER_CARDS: {
    id: Exclude<SelectedLayer, 'geral'>
    label: string
    color: string
    bgColor: string
    borderColor: string
    icon: typeof Shield
    metrics: { label: string; value: string; ok: boolean }[]
  }[] = [
    {
      id: 'expeditor',
      label: 'Expeditor',
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      borderColor: 'border-warning/30',
      icon: Clock,
      metrics: [
        { label: 'Pontualidade', value: `${layerMetrics.punctualityRate}%`, ok: layerMetrics.punctualityRate >= 90 },
        { label: 'Absenteismo', value: `${layerMetrics.absenteeismRate}%`, ok: layerMetrics.absenteeismRate <= 5 },
        { label: 'Check-ins', value: String(layerMetrics.totalCheckIns), ok: true },
      ],
    },
    {
      id: 'supervisor',
      label: 'Supervisor',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/30',
      icon: Users,
      metrics: [
        { label: 'Cobertura Escala', value: `${layerMetrics.coverageRate}%`, ok: layerMetrics.coverageRate >= 95 },
        { label: 'Vagas Abertas', value: String(layerMetrics.unfilledSlots), ok: layerMetrics.unfilledSlots === 0 },
        { label: 'H.Extras', value: `${Math.round(layerMetrics.totalOvertime / 60)}h`, ok: layerMetrics.totalOvertime < 240 },
      ],
    },
    {
      id: 'gerente',
      label: 'Gerente',
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      borderColor: 'border-accent/30',
      icon: TrendingUp,
      metrics: [
        { label: 'SLA', value: `${layerMetrics.avgSla.toFixed(1)}%`, ok: layerMetrics.avgSla >= 95 },
        { label: 'Taxa Erro', value: `${layerMetrics.errorRate.toFixed(1)}%`, ok: layerMetrics.errorRate <= 5 },
        { label: 'Pedidos', value: String(layerMetrics.totalOrders), ok: true },
      ],
    },
    {
      id: 'rh',
      label: 'RH',
      color: 'text-success',
      bgColor: 'bg-success/10',
      borderColor: 'border-success/30',
      icon: Activity,
      metrics: [
        { label: 'Ativos', value: String(layerMetrics.activeCount), ok: true },
        { label: 'Nota Media', value: layerMetrics.avgFeedback > 0 ? layerMetrics.avgFeedback.toFixed(1) : '-', ok: layerMetrics.avgFeedback >= 3.5 || layerMetrics.avgFeedback === 0 },
        { label: 'Ferias', value: String(layerMetrics.onVacation), ok: true },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className={`rounded-xl border-2 ${overallBg} p-4 flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          <div className={`text-4xl font-black ${overallColor}`}>{overallScore}</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Score Operacional Geral</p>
            <p className="text-xs text-muted-foreground">Media ponderada dos 4 layers — semana atual</p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div><span className="font-bold text-destructive">{totalViolations}</span> violacoes</div>
          <div><span className="font-bold text-success">{totalHighlights}</span> destaques</div>
        </div>
      </div>

      {/* Layer cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LAYER_CARDS.map(({ id, label, color, bgColor, borderColor, icon: Icon, metrics }) => {
          const data = byLayer[id]
          const { verdict, isGood, isOk } = computeVerdict(data?.violations.length ?? 0, data?.negatives.length ?? 0)
          const verdictColor = isGood ? 'text-success' : isOk ? 'text-warning' : 'text-destructive'
          const score = radarData.find(r => r.layer === label)?.score ?? 0
          const violations = data?.violations.length ?? 0

          return (
            <button
              key={id}
              onClick={() => onSelectLayer(id)}
              className={`group rounded-xl border ${borderColor} ${bgColor} p-4 text-left transition-all hover:shadow-md hover:scale-[1.02] active:scale-100`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className={`text-sm font-bold ${color}`}>{label}</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Score bar */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Saude</span>
                  <span className={`font-bold ${verdictColor}`}>{score}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-background/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isGood ? 'bg-success' : isOk ? 'bg-warning' : 'bg-destructive'}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-1.5 mb-3">
                {metrics.map((m, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className={`font-semibold ${m.ok ? 'text-foreground' : 'text-destructive'}`}>{m.value}</span>
                  </div>
                ))}
              </div>

              {/* Verdict */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${verdictColor}`}>{verdict}</span>
                {violations > 0 && (
                  <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                    {violations} violac{violations === 1 ? 'ao' : 'oes'}
                  </span>
                )}
                {violations === 0 && (
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Radar chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BarChart2 className="h-4 w-4" /> Radar de Saude por Layer
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="layer" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Radar
                name="Score"
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Violations bar chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-4 w-4" /> Violacoes por Layer
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={violationsBarData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontSize: 12 }}
                itemStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {violationsBarData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary highlights */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={Zap}
          label="Maior Risco"
          value={(() => {
            const worst = [...LAYER_CARDS].sort((a, b) =>
              (byLayer[b.id]?.violations.length ?? 0) - (byLayer[a.id]?.violations.length ?? 0)
            )[0]
            return (byLayer[worst.id]?.violations.length ?? 0) > 0 ? worst.label : 'Nenhum'
          })()}
          color="text-destructive"
        />
        <SummaryTile
          icon={Package}
          label="Pedidos Semana"
          value={layerMetrics.totalOrders > 0 ? String(layerMetrics.totalOrders) : '-'}
          color="text-primary"
        />
        <SummaryTile
          icon={Info}
          label="Total Colaboradores Ativos"
          value={String(layerMetrics.activeCount)}
          color="text-success"
        />
      </div>
    </div>
  )
}

function SummaryTile({ icon: Icon, label, value, color }: { icon: typeof Shield; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <Icon className={`h-8 w-8 ${color} opacity-80 shrink-0`} />
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  )
}

// Dummy type for inference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMetrics = any
function computeLayerMetrics(_state: AnyMetrics, _weekStart: string) { return {} as AnyMetrics }
void computeLayerMetrics

// ── Layer Detail Views ────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function VerdictCard({ positives, negatives, violations, layer }: {
  positives: number; negatives: number; violations: number; layer: string
}) {
  const { verdict, isGood, isOk } = computeVerdict(violations, negatives)
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

function ExpeditorView({ metrics, empMap, positives, negatives, violations }: {
  metrics: ReturnType<typeof computeLayerMetrics>
  empMap: Record<string, string>
  positives: number; negatives: number; violations: number
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Check-ins" value={metrics.totalCheckIns} />
        <MetricCard label="No Horario" value={metrics.onTime} color="text-success" />
        <MetricCard label="Atrasos" value={metrics.lates} color={metrics.lates > 0 ? 'text-warning' : 'text-success'} />
        <MetricCard label="Faltas" value={metrics.absences} color={metrics.absences > 0 ? 'text-destructive' : 'text-success'} />
        <MetricCard label="Pontualidade" value={`${metrics.punctualityRate}%`} color={metrics.punctualityRate >= 90 ? 'text-success' : 'text-warning'} />
        <MetricCard label="Absenteismo" value={`${metrics.absenteeismRate}%`} color={metrics.absenteeismRate <= 5 ? 'text-success' : 'text-destructive'} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-warning uppercase">
            <Clock className="h-4 w-4" /> Maiores Atrasados
          </h4>
          {Object.keys(metrics.empLates).length === 0 ? (
            <p className="text-xs text-success flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Todos pontuais!</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(metrics.empLates as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => (
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
          {Object.keys(metrics.empAbsences).length === 0 ? (
            <p className="text-xs text-success flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Zero faltas!</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(metrics.empAbsences as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => (
                <div key={id} className="flex justify-between rounded-lg bg-destructive/5 px-3 py-1.5 text-xs">
                  <span className="text-foreground">{empMap[id] || id}</span>
                  <span className="font-bold text-destructive">{count}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <VerdictCard positives={positives} negatives={negatives} violations={violations} layer="expeditor" />
    </>
  )
}

function SupervisorView({ metrics, positives, negatives, violations }: {
  metrics: ReturnType<typeof computeLayerMetrics>
  positives: number; negatives: number; violations: number
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Vagas Abertas" value={metrics.unfilledSlots} color={metrics.unfilledSlots > 0 ? 'text-destructive' : 'text-success'} />
        <MetricCard label="Cobertura Escala" value={`${metrics.coverageRate}%`} color={metrics.coverageRate >= 95 ? 'text-success' : 'text-warning'} />
        <MetricCard label="Horas Extras" value={`${Math.round(metrics.totalOvertime / 60)}h`} sub={`${metrics.totalOvertime}min total`} color="text-warning" />
        <MetricCard label="Deficit Horas" value={`${Math.round(metrics.totalDeficit / 60)}h`} sub={`${metrics.totalDeficit}min total`} color={metrics.totalDeficit > 0 ? 'text-destructive' : 'text-success'} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricCard label="Check-ins" value={metrics.totalCheckIns} />
        <MetricCard label="Atrasos" value={metrics.lates} color={metrics.lates > 0 ? 'text-warning' : 'text-success'} />
        <MetricCard label="Faltas" value={metrics.absences} color={metrics.absences > 0 ? 'text-destructive' : 'text-success'} />
      </div>
      <VerdictCard positives={positives} negatives={negatives} violations={violations} layer="supervisor" />
    </>
  )
}

function GerenteView({ metrics, positives, negatives, violations }: {
  metrics: ReturnType<typeof computeLayerMetrics>
  positives: number; negatives: number; violations: number
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Pedidos" value={metrics.totalOrders} />
        <MetricCard label="Produtividade" value={`${metrics.avgProductivity.toFixed(1)}`} sub="ped/hora" color="text-primary" />
        <MetricCard label="SLA" value={`${metrics.avgSla.toFixed(1)}%`} color={metrics.avgSla >= 95 ? 'text-success' : 'text-warning'} />
        <MetricCard label="Erros" value={metrics.totalErrors} color={metrics.totalErrors > 0 ? 'text-destructive' : 'text-success'} />
        <MetricCard label="Custo Reembolso" value={`R$${metrics.totalErrorCost.toFixed(0)}`} color="text-destructive" />
        <MetricCard label="Taxa Erro" value={`${metrics.errorRate.toFixed(1)}%`} color={metrics.errorRate > 5 ? 'text-destructive' : 'text-success'} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricCard label="Horas Trabalhadas" value={`${metrics.totalHours.toFixed(0)}h`} />
        <MetricCard label="Tempo Expedicao" value={`${metrics.avgExpedition > 0 ? Math.round(metrics.avgExpedition) : '-'}s`} sub="media por pedido" />
        <MetricCard label="Absenteismo" value={`${metrics.absenteeismRate}%`} color={metrics.absenteeismRate <= 5 ? 'text-success' : 'text-destructive'} />
      </div>
      <VerdictCard positives={positives} negatives={negatives} violations={violations} layer="gerente" />
    </>
  )
}

function RhView({ metrics, positives, negatives, violations }: {
  metrics: ReturnType<typeof computeLayerMetrics>
  positives: number; negatives: number; violations: number
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Ativos" value={metrics.activeCount} color="text-success" />
        <MetricCard label="Ferias" value={metrics.onVacation} color="text-primary" />
        <MetricCard label="Inativos" value={metrics.inactive} color="text-muted-foreground" />
        <MetricCard label="Avaliacoes" value={metrics.feedbackCount} sub="esta semana" />
        <MetricCard label="Nota Media" value={metrics.avgFeedback > 0 ? metrics.avgFeedback.toFixed(1) : '-'} sub="de 5.0" color="text-primary" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Absenteismo" value={`${metrics.absenteeismRate}%`} color={metrics.absenteeismRate <= 5 ? 'text-success' : 'text-destructive'} />
        <MetricCard label="Cobertura Escala" value={`${metrics.coverageRate}%`} color={metrics.coverageRate >= 95 ? 'text-success' : 'text-warning'} />
        <MetricCard label="Vagas Abertas" value={metrics.unfilledSlots} color={metrics.unfilledSlots > 0 ? 'text-destructive' : 'text-success'} />
        <MetricCard label="Horas Extras" value={`${Math.round(metrics.totalOvertime / 60)}h`} color="text-warning" />
      </div>
      <VerdictCard positives={positives} negatives={negatives} violations={violations} layer="rh" />
    </>
  )
}
