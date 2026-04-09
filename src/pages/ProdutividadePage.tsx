import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Zap,
  AlertTriangle,
  Timer,
  Target,
  Trophy,
  Crown,
  Users,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  Save,
  Gift,
  CheckCircle,
  XCircle,
  Settings,
  BarChart3,
  TrendingUp,
  Upload,
  FileText,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useApp } from '@/store/AppContext'
import { cn, formatCurrency } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ProductivityRecord, WeeklyGoal } from '@/types'
import { parseProductivityCsv, matchEmployees, type CsvParsedRow } from '@/services/csvImport'

// ─── Helpers ────────────────────────────────────────────────────────

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

function formatSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return sec > 0 ? `${m}m${sec}s` : `${m}min`
}

type Layer = 'colaborador' | 'lider'

// ─── Big Number Component ───────────────────────────────────────────

function BigMetric({
  label,
  value,
  unit,
  icon: Icon,
  target,
  targetLabel,
  variant = 'default',
}: {
  label: string
  value: string | number
  unit?: string
  icon: typeof Zap
  target?: number
  targetLabel?: string
  variant?: 'default' | 'success' | 'warning' | 'destructive'
}) {
  const colorMap = {
    default: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  }
  const bgMap = {
    default: 'bg-primary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
    destructive: 'bg-destructive/10',
  }
  return (
    <div className={cn('rounded-xl p-4 sm:p-5', bgMap[variant])}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('h-5 w-5', colorMap[variant])} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-3xl font-black sm:text-4xl', colorMap[variant])}>{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {target !== undefined && targetLabel && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          Meta: <span className="font-semibold text-foreground">{targetLabel}</span>
        </div>
      )}
    </div>
  )
}

// ─── MetGoal indicator ──────────────────────────────────────────────

function GoalStatus({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg px-3 py-2',
      met ? 'bg-success/10' : 'bg-destructive/10',
    )}>
      {met
        ? <CheckCircle className="h-4 w-4 text-success shrink-0" />
        : <XCircle className="h-4 w-4 text-destructive shrink-0" />
      }
      <span className={cn('text-sm font-medium', met ? 'text-success' : 'text-destructive')}>
        {label}
      </span>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ProdutividadePage() {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const [layer, setLayer] = useState<Layer>(
    state.currentUser.role === 'gerente' || state.currentUser.role === 'supervisor' || state.currentUser.role === 'admin' ? 'lider' : 'colaborador',
  )
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCsvText, setImportCsvText] = useState('')
  const [importPreview, setImportPreview] = useState<{
    matched: Array<CsvParsedRow & { employeeId: string }>
    unmatched: CsvParsedRow[]
    errors: Array<{ line: number; message: string }>
  } | null>(null)
  const [importing, setImporting] = useState(false)

  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset])
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  // Load from API when week changes
  useEffect(() => {
    api.get<ProductivityRecord[]>(`/api/productivity/week/${weekStart}`)
      .then(data => dispatch({ type: 'SET_PRODUCTIVITY_RECORDS', payload: data }))
      .catch(() => {})
  }, [weekStart, dispatch])

  const activeEmployees = useMemo(
    () => state.employees.filter((e) => e.status === 'ativo' && e.role !== 'gerente'),
    [state.employees],
  )

  const weekRecords = useMemo(
    () => state.productivityRecords.filter((r) => r.weekStart === weekStart),
    [state.productivityRecords, weekStart],
  )

  const weekGoal = useMemo(
    () => state.weeklyGoals.find((g) => g.weekStart === weekStart) ?? null,
    [state.weeklyGoals, weekStart],
  )

  // ─── Aggregate metrics (team) ────────────────────────────────────

  const teamMetrics = useMemo(() => {
    if (weekRecords.length === 0) return null

    const totalOrders = weekRecords.reduce((s, r) => s + r.totalOrders, 0)
    const totalErrors = weekRecords.reduce((s, r) => s + r.totalErrors, 0)
    const totalErrorCost = weekRecords.reduce((s, r) => s + r.errorCost, 0)
    const totalHours = weekRecords.reduce((s, r) => s + r.hoursWorked, 0)
    const avgExpedition = weekRecords.length > 0
      ? weekRecords.reduce((s, r) => s + r.avgExpeditionTime, 0) / weekRecords.length
      : 0
    const avgSla = weekRecords.length > 0
      ? weekRecords.reduce((s, r) => s + r.slaCompliance, 0) / weekRecords.length
      : 0
    const errorRate = totalOrders > 0 ? (totalErrors / totalOrders) * 100 : 0

    return { totalOrders, totalErrors, totalErrorCost, totalHours, avgExpedition, avgSla, errorRate }
  }, [weekRecords])

  // ─── Individual metrics ──────────────────────────────────────────

  const employeeMetrics = useMemo(() => {
    return activeEmployees.map((emp) => {
      const records = weekRecords.filter((r) => r.employeeId === emp.id)
      const totalOrders = records.reduce((s, r) => s + r.totalOrders, 0)
      const totalErrors = records.reduce((s, r) => s + r.totalErrors, 0)
      const errorCost = records.reduce((s, r) => s + r.errorCost, 0)
      const totalHours = records.reduce((s, r) => s + r.hoursWorked, 0)
      const avgExpedition = records.length > 0
        ? records.reduce((s, r) => s + r.avgExpeditionTime, 0) / records.length
        : 0
      const avgSla = records.length > 0
        ? records.reduce((s, r) => s + r.slaCompliance, 0) / records.length
        : 0
      const ordersPerHour = totalHours > 0 ? totalOrders / totalHours : 0

      // Check individual goals
      let individualMet = false
      if (weekGoal && records.length > 0) {
        individualMet =
          ordersPerHour >= weekGoal.individualOrdersPerHourTarget &&
          totalErrors <= weekGoal.individualMaxErrors &&
          avgSla >= weekGoal.individualSlaTarget &&
          avgExpedition <= weekGoal.individualExpeditionTarget
      }

      return {
        ...emp,
        totalOrders,
        totalErrors,
        errorCost,
        totalHours,
        avgExpedition,
        avgSla,
        ordersPerHour,
        individualMet,
        hasData: records.length > 0,
      }
    }).sort((a, b) => b.ordersPerHour - a.ordersPerHour)
  }, [activeEmployees, weekRecords, weekGoal])

  const selectedEmpMetrics = useMemo(
    () => employeeMetrics.find((e) => e.id === selectedEmployeeId) ?? null,
    [employeeMetrics, selectedEmployeeId],
  )

  // ─── Team goal check ─────────────────────────────────────────────

  const teamGoalMet = useMemo(() => {
    if (!weekGoal || !teamMetrics) return false
    return (
      teamMetrics.totalOrders >= weekGoal.teamOrdersTarget &&
      teamMetrics.totalErrors <= weekGoal.teamMaxErrors &&
      teamMetrics.totalErrorCost <= weekGoal.teamMaxErrorCost &&
      teamMetrics.avgExpedition <= weekGoal.teamAvgExpeditionTarget &&
      teamMetrics.avgSla >= weekGoal.teamSlaTarget
    )
  }, [weekGoal, teamMetrics])

  // ─── History data (last 6 weeks) ──────────────────────────────────

  const historyData = useMemo(() => {
    const weeks: { label: string; weekStart: string; errors: number; errorCost: number; sla: number; expedition: number; orders: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const ws = getWeekStart(-i + weekOffset)
      const dates = getWeekDates(ws)
      const records = state.productivityRecords.filter((r) => r.weekStart === ws)
      if (records.length === 0) {
        weeks.push({ label: formatDateShort(dates[0]), weekStart: ws, errors: 0, errorCost: 0, sla: 0, expedition: 0, orders: 0 })
      } else {
        weeks.push({
          label: formatDateShort(dates[0]),
          weekStart: ws,
          errors: records.reduce((s, r) => s + r.totalErrors, 0),
          errorCost: records.reduce((s, r) => s + r.errorCost, 0),
          sla: records.reduce((s, r) => s + r.slaCompliance, 0) / records.length,
          expedition: records.reduce((s, r) => s + r.avgExpeditionTime, 0) / records.length,
          orders: records.reduce((s, r) => s + r.totalOrders, 0),
        })
      }
    }
    return weeks
  }, [state.productivityRecords, weekOffset])

  const individualHistoryData = useMemo(() => {
    if (!selectedEmployeeId) return []
    const weeks: { label: string; errors: number; sla: number; ordersPerHour: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const ws = getWeekStart(-i + weekOffset)
      const dates = getWeekDates(ws)
      const records = state.productivityRecords.filter((r) => r.weekStart === ws && r.employeeId === selectedEmployeeId)
      const totalOrders = records.reduce((s, r) => s + r.totalOrders, 0)
      const totalHours = records.reduce((s, r) => s + r.hoursWorked, 0)
      weeks.push({
        label: formatDateShort(dates[0]),
        errors: records.reduce((s, r) => s + r.totalErrors, 0),
        sla: records.length > 0 ? records.reduce((s, r) => s + r.slaCompliance, 0) / records.length : 0,
        ordersPerHour: totalHours > 0 ? totalOrders / totalHours : 0,
      })
    }
    return weeks
  }, [selectedEmployeeId, state.productivityRecords, weekOffset])

  // ─── Goal Modal Form ─────────────────────────────────────────────

  const [goalForm, setGoalForm] = useState({
    teamOrdersTarget: weekGoal?.teamOrdersTarget ?? 2000,
    teamMaxErrors: weekGoal?.teamMaxErrors ?? 10,
    teamMaxErrorCost: weekGoal?.teamMaxErrorCost ?? 150,
    teamAvgExpeditionTarget: weekGoal?.teamAvgExpeditionTarget ?? 480,
    teamSlaTarget: weekGoal?.teamSlaTarget ?? 95,
    individualOrdersPerHourTarget: weekGoal?.individualOrdersPerHourTarget ?? 25,
    individualMaxErrors: weekGoal?.individualMaxErrors ?? 2,
    individualSlaTarget: weekGoal?.individualSlaTarget ?? 95,
    individualExpeditionTarget: weekGoal?.individualExpeditionTarget ?? 480,
    teamPrize: weekGoal?.teamPrize ?? 50,
    individualPrize: weekGoal?.individualPrize ?? 30,
  })

  const saveGoal = useCallback(() => {
    const goal: WeeklyGoal = {
      id: weekGoal?.id ?? crypto.randomUUID(),
      weekStart,
      ...goalForm,
      createdAt: new Date().toISOString(),
      createdBy: state.currentUser.name,
    }
    dispatch({ type: 'SET_WEEKLY_GOAL', payload: goal })
    setShowGoalModal(false)
  }, [goalForm, weekStart, weekGoal, dispatch, state.currentUser.name])

  // ─── Record Modal Form ───────────────────────────────────────────

  const [recordForm, setRecordForm] = useState({
    employeeId: '',
    totalOrders: '',
    totalErrors: '',
    errorCost: '',
    avgExpeditionTime: '',
    slaCompliance: '',
    hoursWorked: '',
    notes: '',
  })

  const saveRecord = useCallback(async () => {
    const hoursWorked = parseFloat(recordForm.hoursWorked) || 0
    const totalOrders = parseInt(recordForm.totalOrders) || 0
    // Check if record already exists for this employee+week — update it
    const existing = state.productivityRecords.find(
      r => r.employeeId === recordForm.employeeId && r.weekStart === weekStart,
    )
    const record: ProductivityRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      employeeId: recordForm.employeeId,
      date: weekStart,
      weekStart,
      totalOrders,
      totalErrors: parseInt(recordForm.totalErrors) || 0,
      errorCost: parseFloat(recordForm.errorCost) || 0,
      avgExpeditionTime: parseFloat(recordForm.avgExpeditionTime) || 0,
      slaCompliance: parseFloat(recordForm.slaCompliance) || 0,
      ordersPerHour: hoursWorked > 0 ? totalOrders / hoursWorked : 0,
      hoursWorked,
      notes: recordForm.notes,
    }
    try {
      await api.post('/api/productivity', record)
      const fresh = await api.get<ProductivityRecord[]>(`/api/productivity/week/${weekStart}`)
      dispatch({ type: 'SET_PRODUCTIVITY_RECORDS', payload: fresh })
    } catch {
      if (existing) {
        dispatch({ type: 'UPDATE_PRODUCTIVITY_RECORD', payload: record })
      } else {
        dispatch({ type: 'ADD_PRODUCTIVITY_RECORD', payload: record })
      }
    }
    setShowRecordModal(false)
    setRecordForm({
      employeeId: '',
      totalOrders: '',
      totalErrors: '',
      errorCost: '',
      avgExpeditionTime: '',
      slaCompliance: '',
      hoursWorked: '',
      notes: '',
    })
  }, [recordForm, weekStart, dispatch, state.productivityRecords])

  // ─── CSV Import ─────────────────────────────────────────────────
  const previewCsv = useCallback(() => {
    if (!importCsvText.trim()) {
      setImportPreview(null)
      return
    }
    const parsed = parseProductivityCsv(importCsvText)
    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      setImportPreview({ matched: [], unmatched: [], errors: parsed.errors })
      return
    }
    const { matched, unmatched } = matchEmployees(parsed.rows, activeEmployees)
    setImportPreview({ matched, unmatched, errors: parsed.errors })
  }, [importCsvText, activeEmployees])

  const confirmImport = useCallback(async () => {
    if (!importPreview || importPreview.matched.length === 0) return
    setImporting(true)
    try {
      const promises = importPreview.matched.map(async (row) => {
        const existing = state.productivityRecords.find(
          r => r.employeeId === row.employeeId && r.weekStart === weekStart,
        )
        const record: ProductivityRecord = {
          id: existing?.id ?? crypto.randomUUID(),
          employeeId: row.employeeId,
          date: weekStart,
          weekStart,
          totalOrders: row.totalOrders,
          totalErrors: row.totalErrors,
          errorCost: row.errorCost,
          avgExpeditionTime: existing?.avgExpeditionTime ?? 0,
          slaCompliance: row.slaCompliance || (existing?.slaCompliance ?? 0),
          ordersPerHour: 0,
          hoursWorked: existing?.hoursWorked ?? 0,
          notes: row.notes || existing?.notes || '',
        }
        return api.post('/api/productivity', record)
      })
      await Promise.all(promises)
      const fresh = await api.get<ProductivityRecord[]>(`/api/productivity/week/${weekStart}`)
      dispatch({ type: 'SET_PRODUCTIVITY_RECORDS', payload: fresh })
      toast('success', `${importPreview.matched.length} registros importados!`)
      setShowImportModal(false)
      setImportCsvText('')
      setImportPreview(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao importar')
    } finally {
      setImporting(false)
    }
  }, [importPreview, weekStart, state.productivityRecords, dispatch, toast])

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">

      {/* ═══ Header ═══ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
            <Zap className="h-6 w-6 text-primary" />
            Produtividade
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Erros, SLA, tempo de expedicao e metas semanais
          </p>
        </div>

        {/* Layer toggle */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          <button
            onClick={() => setLayer('colaborador')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all sm:px-4',
              layer === 'colaborador'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Target className="h-3.5 w-3.5" />
            Colaborador
          </button>
          <button
            onClick={() => setLayer('lider')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all sm:px-4',
              layer === 'lider'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Crown className="h-3.5 w-3.5" />
            Lider
          </button>
        </div>
      </div>

      {/* ═══ Week selector ═══ */}
      <Card variant="glass" className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground sm:text-base">
            {formatDateShort(weekDates[0])} — {formatDateShort(weekDates[6])}
          </span>
          {weekOffset === 0 && <Badge variant="success" size="sm">Atual</Badge>}
        </div>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LAYER: LIDER                                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {layer === 'lider' && (
        <>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setGoalForm({
                  teamOrdersTarget: weekGoal?.teamOrdersTarget ?? 2000,
                  teamMaxErrors: weekGoal?.teamMaxErrors ?? 10,
                  teamMaxErrorCost: weekGoal?.teamMaxErrorCost ?? 150,
                  teamAvgExpeditionTarget: weekGoal?.teamAvgExpeditionTarget ?? 480,
                  teamSlaTarget: weekGoal?.teamSlaTarget ?? 95,
                  individualOrdersPerHourTarget: weekGoal?.individualOrdersPerHourTarget ?? 25,
                  individualMaxErrors: weekGoal?.individualMaxErrors ?? 2,
                  individualSlaTarget: weekGoal?.individualSlaTarget ?? 95,
                  individualExpeditionTarget: weekGoal?.individualExpeditionTarget ?? 480,
                  teamPrize: weekGoal?.teamPrize ?? 50,
                  individualPrize: weekGoal?.individualPrize ?? 30,
                })
                setShowGoalModal(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Settings className="h-4 w-4" />
              {weekGoal ? 'Editar Metas' : 'Definir Metas'}
            </button>
            <button
              onClick={() => {
                setRecordForm({ employeeId: '', totalOrders: '', totalErrors: '', errorCost: '', avgExpeditionTime: '', slaCompliance: '', hoursWorked: '', notes: '' })
                setShowRecordModal(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Lancar Dados Semanais
            </button>
            <button
              onClick={() => {
                setImportCsvText('')
                setImportPreview(null)
                setShowImportModal(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/20 border border-accent/30"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>
          </div>

          {/* ─── Big 3 Metrics ─── */}
          {teamMetrics ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <BigMetric
                  label="Erros & Reembolso"
                  value={teamMetrics.totalErrors}
                  unit={`erros (${formatCurrency(teamMetrics.totalErrorCost)})`}
                  icon={AlertTriangle}
                  target={weekGoal?.teamMaxErrors}
                  targetLabel={weekGoal ? `max ${weekGoal.teamMaxErrors} erros / ${formatCurrency(weekGoal.teamMaxErrorCost)}` : undefined}
                  variant={
                    weekGoal
                      ? teamMetrics.totalErrors <= weekGoal.teamMaxErrors ? 'success' : 'destructive'
                      : 'default'
                  }
                />
                <BigMetric
                  label="Tempo Expedicao"
                  value={formatSeconds(teamMetrics.avgExpedition)}
                  icon={Timer}
                  target={weekGoal?.teamAvgExpeditionTarget}
                  targetLabel={weekGoal ? `max ${formatSeconds(weekGoal.teamAvgExpeditionTarget)}` : undefined}
                  variant={
                    weekGoal
                      ? teamMetrics.avgExpedition <= weekGoal.teamAvgExpeditionTarget ? 'success' : 'warning'
                      : 'default'
                  }
                />
                <BigMetric
                  label="SLA Atendimento"
                  value={`${teamMetrics.avgSla.toFixed(1)}`}
                  unit="%"
                  icon={Target}
                  target={weekGoal?.teamSlaTarget}
                  targetLabel={weekGoal ? `min ${weekGoal.teamSlaTarget}%` : undefined}
                  variant={
                    weekGoal
                      ? teamMetrics.avgSla >= weekGoal.teamSlaTarget ? 'success' : 'destructive'
                      : 'default'
                  }
                />
              </div>

              {/* Secondary metrics */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="text-center">
                  <p className="text-xs text-muted-foreground">Pedidos Total</p>
                  <p className="text-2xl font-bold text-foreground">{teamMetrics.totalOrders}</p>
                  {weekGoal && (
                    <p className="text-[10px] text-muted-foreground">Meta: {weekGoal.teamOrdersTarget}</p>
                  )}
                </Card>
                <Card className="text-center">
                  <p className="text-xs text-muted-foreground">Taxa de Erro</p>
                  <p className="text-2xl font-bold text-foreground">{teamMetrics.errorRate.toFixed(1)}%</p>
                </Card>
                <Card className="text-center">
                  <p className="text-xs text-muted-foreground">Horas Totais</p>
                  <p className="text-2xl font-bold text-foreground">{teamMetrics.totalHours.toFixed(0)}h</p>
                </Card>
                <Card className="text-center">
                  <p className="text-xs text-muted-foreground">Custo Reembolso</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(teamMetrics.totalErrorCost)}</p>
                </Card>
              </div>

              {/* ─── Prize Status ─── */}
              {weekGoal && (
                <Card className={cn(
                  'border-2',
                  teamGoalMet ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5',
                )}>
                  <div className="flex items-center gap-3 mb-4">
                    <Trophy className={cn('h-6 w-6', teamGoalMet ? 'text-success' : 'text-warning')} />
                    <div>
                      <h3 className="font-bold text-foreground">
                        {teamGoalMet ? 'Meta da Equipe Batida!' : 'Meta da Equipe'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {teamGoalMet
                          ? `Premio de ${formatCurrency(weekGoal.teamPrize)} por pessoa`
                          : 'Ainda faltam indicadores para bater'}
                      </p>
                    </div>
                    {teamGoalMet && (
                      <Badge variant="success" size="md" className="ml-auto">
                        <Gift className="mr-1 h-3.5 w-3.5" />
                        {formatCurrency(weekGoal.teamPrize)}/pessoa
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <GoalStatus
                      met={teamMetrics.totalOrders >= weekGoal.teamOrdersTarget}
                      label={`Pedidos: ${teamMetrics.totalOrders}/${weekGoal.teamOrdersTarget}`}
                    />
                    <GoalStatus
                      met={teamMetrics.totalErrors <= weekGoal.teamMaxErrors}
                      label={`Erros: ${teamMetrics.totalErrors}/${weekGoal.teamMaxErrors} max`}
                    />
                    <GoalStatus
                      met={teamMetrics.totalErrorCost <= weekGoal.teamMaxErrorCost}
                      label={`Reembolso: ${formatCurrency(teamMetrics.totalErrorCost)}/${formatCurrency(weekGoal.teamMaxErrorCost)} max`}
                    />
                    <GoalStatus
                      met={teamMetrics.avgExpedition <= weekGoal.teamAvgExpeditionTarget}
                      label={`Expedicao: ${formatSeconds(teamMetrics.avgExpedition)}/${formatSeconds(weekGoal.teamAvgExpeditionTarget)} max`}
                    />
                    <GoalStatus
                      met={teamMetrics.avgSla >= weekGoal.teamSlaTarget}
                      label={`SLA: ${teamMetrics.avgSla.toFixed(1)}%/${weekGoal.teamSlaTarget}% min`}
                    />
                  </div>
                </Card>
              )}

              {/* ─── Employee ranking table ─── */}
              <Card>
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Ranking Individual
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-2.5 sm:px-3">#</th>
                        <th className="px-2 py-2.5 sm:px-3">Nome</th>
                        <th className="px-2 py-2.5 text-right sm:px-3">Pedidos</th>
                        <th className="px-2 py-2.5 text-right sm:px-3">Ped/H</th>
                        <th className="px-2 py-2.5 text-center sm:px-3">Erros</th>
                        <th className="px-2 py-2.5 text-right sm:px-3">Reemb.</th>
                        <th className="px-2 py-2.5 text-right sm:px-3">Expedicao</th>
                        <th className="px-2 py-2.5 text-right sm:px-3">SLA</th>
                        <th className="px-2 py-2.5 text-center sm:px-3">Premio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeMetrics.map((emp, idx) => (
                        <tr
                          key={emp.id}
                          className={cn(
                            'border-b border-border/50 transition-colors hover:bg-muted/20',
                            emp.individualMet && 'bg-success/5',
                          )}
                        >
                          <td className="px-2 py-2.5 sm:px-3">
                            {idx === 0 && emp.hasData ? (
                              <Crown className="h-4 w-4 text-warning" />
                            ) : (
                              <span className="text-xs text-muted-foreground">{idx + 1}</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 font-medium text-foreground sm:px-3">
                            {emp.nickname || emp.name}
                          </td>
                          <td className="px-2 py-2.5 text-right text-foreground sm:px-3">
                            {emp.hasData ? emp.totalOrders : '-'}
                          </td>
                          <td className="px-2 py-2.5 text-right font-semibold sm:px-3">
                            <span className={cn(
                              weekGoal && emp.hasData
                                ? emp.ordersPerHour >= weekGoal.individualOrdersPerHourTarget
                                  ? 'text-success'
                                  : 'text-warning'
                                : 'text-foreground',
                            )}>
                              {emp.hasData ? emp.ordersPerHour.toFixed(1) : '-'}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center sm:px-3">
                            <span className={cn(
                              emp.totalErrors > 0 ? 'text-destructive font-semibold' : 'text-success',
                            )}>
                              {emp.hasData ? emp.totalErrors : '-'}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right text-destructive sm:px-3">
                            {emp.hasData && emp.errorCost > 0 ? formatCurrency(emp.errorCost) : '-'}
                          </td>
                          <td className="px-2 py-2.5 text-right sm:px-3">
                            {emp.hasData ? formatSeconds(emp.avgExpedition) : '-'}
                          </td>
                          <td className="px-2 py-2.5 text-right sm:px-3">
                            <span className={cn(
                              'font-semibold',
                              weekGoal && emp.hasData
                                ? emp.avgSla >= weekGoal.individualSlaTarget ? 'text-success' : 'text-destructive'
                                : 'text-foreground',
                            )}>
                              {emp.hasData ? `${emp.avgSla.toFixed(0)}%` : '-'}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center sm:px-3">
                            {emp.individualMet ? (
                              <Badge variant="success" size="sm">
                                <Gift className="mr-0.5 h-3 w-3" />
                                {weekGoal ? formatCurrency(weekGoal.individualPrize) : ''}
                              </Badge>
                            ) : emp.hasData ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* ─── History Charts (Lider) ─── */}
              {historyData.some((w) => w.orders > 0) && (
                <Card>
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Evolucao Semanal
                  </h3>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Erros por Semana</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={historyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                          <XAxis dataKey="label" tick={{ fill: 'hsl(210 2% 60%)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'hsl(210 2% 60%)', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 13%)', borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: 'hsl(0 0% 93.7%)' }}
                          />
                          <Bar dataKey="errors" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} name="Erros" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">SLA Atendimento (%)</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={historyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                          <XAxis dataKey="label" tick={{ fill: 'hsl(210 2% 60%)', fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: 'hsl(210 2% 60%)', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 13%)', borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: 'hsl(0 0% 93.7%)' }}
                          />
                          <Line type="monotone" dataKey="sla" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={{ fill: 'hsl(142 71% 45%)' }} name="SLA %" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              )}
            </>
          ) : (
            /* No data state */
            <Card variant="glass" className="py-12 text-center">
              <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-lg font-semibold text-foreground">Sem dados de produtividade</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina as metas da semana e lance os dados semanais de cada colaborador.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => setShowGoalModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Settings className="h-4 w-4" />
                  Definir Metas
                </button>
                <button
                  onClick={() => {
                    setRecordForm({ employeeId: '', totalOrders: '', totalErrors: '', errorCost: '', avgExpeditionTime: '', slaCompliance: '', hoursWorked: '', notes: '' })
                    setShowRecordModal(true)
                  }}
                  className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Lancar Dados Semanais
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LAYER: COLABORADOR                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {layer === 'colaborador' && (
        <>
          {/* Employee selector */}
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-medium text-foreground sm:text-lg"
          >
            <option value="">Selecione seu nome...</option>
            {activeEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nickname || emp.name}
              </option>
            ))}
          </select>

          {selectedEmpMetrics && (
            <>
              {/* My Big 3 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <BigMetric
                  label="Meus Erros"
                  value={selectedEmpMetrics.totalErrors}
                  unit={selectedEmpMetrics.errorCost > 0 ? `(${formatCurrency(selectedEmpMetrics.errorCost)})` : 'erros'}
                  icon={AlertTriangle}
                  target={weekGoal?.individualMaxErrors}
                  targetLabel={weekGoal ? `max ${weekGoal.individualMaxErrors} erros` : undefined}
                  variant={
                    weekGoal
                      ? selectedEmpMetrics.totalErrors <= weekGoal.individualMaxErrors ? 'success' : 'destructive'
                      : selectedEmpMetrics.hasData ? 'default' : 'default'
                  }
                />
                <BigMetric
                  label="Meu Tempo Expedicao"
                  value={selectedEmpMetrics.hasData ? formatSeconds(selectedEmpMetrics.avgExpedition) : '-'}
                  icon={Timer}
                  target={weekGoal?.individualExpeditionTarget}
                  targetLabel={weekGoal ? `max ${formatSeconds(weekGoal.individualExpeditionTarget)}` : undefined}
                  variant={
                    weekGoal && selectedEmpMetrics.hasData
                      ? selectedEmpMetrics.avgExpedition <= weekGoal.individualExpeditionTarget ? 'success' : 'warning'
                      : 'default'
                  }
                />
                <BigMetric
                  label="Meu SLA"
                  value={selectedEmpMetrics.hasData ? `${selectedEmpMetrics.avgSla.toFixed(1)}` : '-'}
                  unit={selectedEmpMetrics.hasData ? '%' : ''}
                  icon={Target}
                  target={weekGoal?.individualSlaTarget}
                  targetLabel={weekGoal ? `min ${weekGoal.individualSlaTarget}%` : undefined}
                  variant={
                    weekGoal && selectedEmpMetrics.hasData
                      ? selectedEmpMetrics.avgSla >= weekGoal.individualSlaTarget ? 'success' : 'destructive'
                      : 'default'
                  }
                />
              </div>

              {/* Orders + rate */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="text-center">
                  <Zap className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-2 text-3xl font-black text-foreground">
                    {selectedEmpMetrics.hasData ? selectedEmpMetrics.totalOrders : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">pedidos na semana</p>
                </Card>
                <Card className="text-center">
                  <TrendingUp className="mx-auto h-5 w-5 text-accent" />
                  <p className="mt-2 text-3xl font-black text-foreground">
                    {selectedEmpMetrics.hasData ? selectedEmpMetrics.ordersPerHour.toFixed(1) : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">pedidos/hora</p>
                  {weekGoal && (
                    <p className="text-[10px] text-muted-foreground">
                      Meta: {weekGoal.individualOrdersPerHourTarget}/h
                    </p>
                  )}
                </Card>
              </div>

              {/* ─── My Goal Progress ─── */}
              {weekGoal && selectedEmpMetrics.hasData && (
                <Card className={cn(
                  'border-2',
                  selectedEmpMetrics.individualMet ? 'border-success/30 bg-success/5' : 'border-border',
                )}>
                  <div className="flex items-center gap-3 mb-4">
                    <Trophy className={cn(
                      'h-6 w-6',
                      selectedEmpMetrics.individualMet ? 'text-success' : 'text-muted-foreground',
                    )} />
                    <div className="flex-1">
                      <h3 className="font-bold text-foreground">
                        {selectedEmpMetrics.individualMet ? 'Voce bateu a meta individual!' : 'Minha Meta Individual'}
                      </h3>
                      {selectedEmpMetrics.individualMet && (
                        <p className="text-sm text-success font-semibold">
                          Premio: {formatCurrency(weekGoal.individualPrize)}
                        </p>
                      )}
                    </div>
                    {selectedEmpMetrics.individualMet && (
                      <Badge variant="success" size="md">
                        <Gift className="mr-1 h-4 w-4" />
                        {formatCurrency(weekGoal.individualPrize)}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <GoalStatus
                      met={selectedEmpMetrics.ordersPerHour >= weekGoal.individualOrdersPerHourTarget}
                      label={`Ped/H: ${selectedEmpMetrics.ordersPerHour.toFixed(1)}/${weekGoal.individualOrdersPerHourTarget}`}
                    />
                    <GoalStatus
                      met={selectedEmpMetrics.totalErrors <= weekGoal.individualMaxErrors}
                      label={`Erros: ${selectedEmpMetrics.totalErrors}/${weekGoal.individualMaxErrors} max`}
                    />
                    <GoalStatus
                      met={selectedEmpMetrics.avgSla >= weekGoal.individualSlaTarget}
                      label={`SLA: ${selectedEmpMetrics.avgSla.toFixed(1)}%/${weekGoal.individualSlaTarget}% min`}
                    />
                    <GoalStatus
                      met={selectedEmpMetrics.avgExpedition <= weekGoal.individualExpeditionTarget}
                      label={`Expedicao: ${formatSeconds(selectedEmpMetrics.avgExpedition)}/${formatSeconds(weekGoal.individualExpeditionTarget)} max`}
                    />
                  </div>
                </Card>
              )}

              {/* ─── Team Goal (view only) ─── */}
              {weekGoal && teamMetrics && (
                <Card className={cn(
                  'border-2',
                  teamGoalMet ? 'border-success/30 bg-success/5' : 'border-border',
                )}>
                  <div className="flex items-center gap-3 mb-3">
                    <Users className={cn('h-5 w-5', teamGoalMet ? 'text-success' : 'text-muted-foreground')} />
                    <h3 className="font-bold text-foreground">
                      {teamGoalMet ? 'A equipe bateu a meta!' : 'Meta da Equipe'}
                    </h3>
                    {teamGoalMet && (
                      <Badge variant="success" size="sm" className="ml-auto">
                        <Gift className="mr-1 h-3 w-3" />
                        +{formatCurrency(weekGoal.teamPrize)}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <GoalStatus
                      met={teamMetrics.totalErrors <= weekGoal.teamMaxErrors}
                      label={`Erros equipe: ${teamMetrics.totalErrors}/${weekGoal.teamMaxErrors} max`}
                    />
                    <GoalStatus
                      met={teamMetrics.avgSla >= weekGoal.teamSlaTarget}
                      label={`SLA equipe: ${teamMetrics.avgSla.toFixed(1)}%/${weekGoal.teamSlaTarget}% min`}
                    />
                  </div>
                </Card>
              )}

              {/* Total prize summary */}
              {weekGoal && selectedEmpMetrics.hasData && (selectedEmpMetrics.individualMet || teamGoalMet) && (
                <div className="rounded-xl bg-gradient-to-r from-success/20 to-primary/20 p-5 text-center">
                  <Gift className="mx-auto h-8 w-8 text-success" />
                  <p className="mt-2 text-sm text-muted-foreground">Seu premio total esta semana</p>
                  <p className="text-4xl font-black text-success">
                    {formatCurrency(
                      (selectedEmpMetrics.individualMet ? weekGoal.individualPrize : 0) +
                      (teamGoalMet ? weekGoal.teamPrize : 0),
                    )}
                  </p>
                  <div className="mt-2 flex justify-center gap-3 text-xs text-muted-foreground">
                    {selectedEmpMetrics.individualMet && (
                      <span>Individual: {formatCurrency(weekGoal.individualPrize)}</span>
                    )}
                    {teamGoalMet && (
                      <span>Equipe: {formatCurrency(weekGoal.teamPrize)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* ─── Individual History ─── */}
              {individualHistoryData.some((w) => w.ordersPerHour > 0) && (
                <Card>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Minha Evolucao
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Pedidos/Hora</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={individualHistoryData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                          <XAxis dataKey="label" tick={{ fill: 'hsl(210 2% 60%)', fontSize: 10 }} />
                          <YAxis tick={{ fill: 'hsl(210 2% 60%)', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 13%)', borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="ordersPerHour" stroke="hsl(69 100% 59%)" strokeWidth={2} dot={{ fill: 'hsl(69 100% 59%)' }} name="Ped/H" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">SLA (%)</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={individualHistoryData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                          <XAxis dataKey="label" tick={{ fill: 'hsl(210 2% 60%)', fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: 'hsl(210 2% 60%)', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 13%)', borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="sla" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={{ fill: 'hsl(142 71% 45%)' }} name="SLA %" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              )}

              {/* No data state */}
              {!selectedEmpMetrics.hasData && (
                <Card variant="glass" className="py-8 text-center">
                  <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 text-foreground font-medium">Ainda sem dados esta semana</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seu lider vai lancar seus numeros semanais de produtividade aqui.
                  </p>
                </Card>
              )}
            </>
          )}

          {!selectedEmployeeId && (
            <Card variant="glass" className="py-10 text-center">
              <Target className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-foreground font-medium">Selecione seu nome acima</p>
              <p className="mt-1 text-sm text-muted-foreground">
                para ver seus indicadores de produtividade, metas e premios.
              </p>
            </Card>
          )}
        </>
      )}

      {/* ═══ Goal Modal ═══ */}
      <Modal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} title="Metas da Semana" size="lg">
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Team goals */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Metas da Equipe
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Pedidos Totais</label>
                <input
                  type="number"
                  value={goalForm.teamOrdersTarget}
                  onChange={(e) => setGoalForm((f) => ({ ...f, teamOrdersTarget: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Max Erros</label>
                <input
                  type="number"
                  value={goalForm.teamMaxErrors}
                  onChange={(e) => setGoalForm((f) => ({ ...f, teamMaxErrors: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Max Custo Reembolso (R$)</label>
                <input
                  type="number"
                  value={goalForm.teamMaxErrorCost}
                  onChange={(e) => setGoalForm((f) => ({ ...f, teamMaxErrorCost: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Tempo Expedicao Max (seg)</label>
                <input
                  type="number"
                  value={goalForm.teamAvgExpeditionTarget}
                  onChange={(e) => setGoalForm((f) => ({ ...f, teamAvgExpeditionTarget: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">SLA Min (%)</label>
                <input
                  type="number"
                  value={goalForm.teamSlaTarget}
                  onChange={(e) => setGoalForm((f) => ({ ...f, teamSlaTarget: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Individual goals */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Target className="h-4 w-4 text-accent" />
              Metas Individuais
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Pedidos/Hora Min</label>
                <input
                  type="number"
                  value={goalForm.individualOrdersPerHourTarget}
                  onChange={(e) => setGoalForm((f) => ({ ...f, individualOrdersPerHourTarget: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Max Erros Individual</label>
                <input
                  type="number"
                  value={goalForm.individualMaxErrors}
                  onChange={(e) => setGoalForm((f) => ({ ...f, individualMaxErrors: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">SLA Individual Min (%)</label>
                <input
                  type="number"
                  value={goalForm.individualSlaTarget}
                  onChange={(e) => setGoalForm((f) => ({ ...f, individualSlaTarget: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Expedicao Individual Max (seg)</label>
                <input
                  type="number"
                  value={goalForm.individualExpeditionTarget}
                  onChange={(e) => setGoalForm((f) => ({ ...f, individualExpeditionTarget: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Prizes */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Gift className="h-4 w-4 text-success" />
              Premios
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Premio Equipe (R$/pessoa)</label>
                <input
                  type="number"
                  value={goalForm.teamPrize}
                  onChange={(e) => setGoalForm((f) => ({ ...f, teamPrize: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Premio Individual (R$)</label>
                <input
                  type="number"
                  value={goalForm.individualPrize}
                  onChange={(e) => setGoalForm((f) => ({ ...f, individualPrize: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
          </div>

          <button
            onClick={saveGoal}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />
            Salvar Metas
          </button>
        </div>
      </Modal>

      {/* ═══ Record Modal ═══ */}
      <Modal isOpen={showRecordModal} onClose={() => setShowRecordModal(false)} title="Lancar Dados Semanais de Produtividade">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Colaborador</label>
            <select
              value={recordForm.employeeId}
              onChange={(e) => {
                const empId = e.target.value
                const existing = state.productivityRecords.find(r => r.employeeId === empId && r.weekStart === weekStart)
                if (existing) {
                  setRecordForm({
                    employeeId: empId,
                    totalOrders: String(existing.totalOrders),
                    totalErrors: String(existing.totalErrors),
                    errorCost: String(existing.errorCost),
                    avgExpeditionTime: String(existing.avgExpeditionTime),
                    slaCompliance: String(existing.slaCompliance),
                    hoursWorked: String(existing.hoursWorked),
                    notes: existing.notes,
                  })
                } else {
                  setRecordForm((f) => ({ ...f, employeeId: empId }))
                }
              }}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
            >
              <option value="">Selecione...</option>
              {activeEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nickname || emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Semana: <span className="font-semibold text-foreground">{formatDateShort(weekDates[0])} — {formatDateShort(weekDates[6])}</span>
            {state.productivityRecords.find(r => r.employeeId === recordForm.employeeId && r.weekStart === weekStart) && (
              <span className="ml-2 text-warning font-medium">(ja existe registro — sera atualizado)</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Total Pedidos</label>
              <input
                type="number"
                value={recordForm.totalOrders}
                onChange={(e) => setRecordForm((f) => ({ ...f, totalOrders: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Horas Trabalhadas</label>
              <input
                type="number"
                step="0.5"
                value={recordForm.hoursWorked}
                onChange={(e) => setRecordForm((f) => ({ ...f, hoursWorked: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Total Erros</label>
              <input
                type="number"
                value={recordForm.totalErrors}
                onChange={(e) => setRecordForm((f) => ({ ...f, totalErrors: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Custo Reembolso (R$)</label>
              <input
                type="number"
                step="0.01"
                value={recordForm.errorCost}
                onChange={(e) => setRecordForm((f) => ({ ...f, errorCost: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Tempo Expedicao Medio (seg)</label>
              <input
                type="number"
                value={recordForm.avgExpeditionTime}
                onChange={(e) => setRecordForm((f) => ({ ...f, avgExpeditionTime: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">SLA Atendimento (%)</label>
              <input
                type="number"
                value={recordForm.slaCompliance}
                onChange={(e) => setRecordForm((f) => ({ ...f, slaCompliance: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Observacoes</label>
            <input
              type="text"
              value={recordForm.notes}
              onChange={(e) => setRecordForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opcional..."
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
            />
          </div>
          <button
            onClick={saveRecord}
            disabled={!recordForm.employeeId}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold',
              recordForm.employeeId
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-primary/30 text-primary/50',
            )}
          >
            <Save className="h-4 w-4" />
            Salvar
          </button>
        </div>
      </Modal>

      {/* ═══ CSV Import Modal ═══ */}
      <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Importar Produtividade via CSV" size="lg">
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div className="rounded-lg border border-border bg-card/50 p-3 text-xs">
            <p className="font-semibold text-foreground mb-1">Como usar</p>
            <ol className="space-y-0.5 text-muted-foreground list-decimal list-inside">
              <li>Exporte CSV do painel iFood/Rappi/Shopper</li>
              <li>Cole o conteúdo abaixo ou arraste o arquivo</li>
              <li>Clique em <strong>Prévia</strong> pra conferir quais colaboradores serão atualizados</li>
              <li>Confirme o import</li>
            </ol>
            <p className="mt-2 text-muted-foreground">
              Cabeçalhos aceitos: <code className="text-primary">colaborador, pedidos, erros, custo_erros, sla, obs</code>
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Arquivo CSV
            </label>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  const text = String(ev.target?.result || '')
                  setImportCsvText(text)
                }
                reader.readAsText(file)
              }}
              className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent hover:file:bg-accent/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Ou cole aqui
            </label>
            <textarea
              value={importCsvText}
              onChange={(e) => setImportCsvText(e.target.value)}
              placeholder={`colaborador,pedidos,erros,custo_erros\nAnna,120,3,45.00\nMiguel,95,1,15.50`}
              rows={6}
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={previewCsv}
              disabled={!importCsvText.trim()}
              className="flex-1 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
            >
              <FileText className="inline h-4 w-4 mr-1" />
              Gerar Prévia
            </button>
          </div>

          {importPreview && (
            <div className="space-y-2">
              {importPreview.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
                  <p className="font-semibold text-destructive mb-1">Erros de parse ({importPreview.errors.length})</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {importPreview.errors.map((e, i) => (
                      <li key={i}>Linha {e.line}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importPreview.matched.length > 0 && (
                <div className="rounded-lg border border-success/40 bg-success/5 p-3">
                  <p className="text-xs font-semibold text-success mb-2">
                    Serão atualizados ({importPreview.matched.length})
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importPreview.matched.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{r.employeeName}</span>
                        <span className="text-muted-foreground">
                          {r.totalOrders} pedidos · {r.totalErrors} erros · {formatCurrency(r.errorCost)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importPreview.unmatched.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                  <p className="text-xs font-semibold text-warning mb-2">
                    Não encontrados ({importPreview.unmatched.length}) — ignorados
                  </p>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {importPreview.unmatched.map((r, i) => (
                      <div key={i}>Linha {r.line}: <strong>{r.employeeName}</strong></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowImportModal(false)}
              className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirmImport()}
              disabled={!importPreview || importPreview.matched.length === 0 || importing}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {importing ? 'Importando...' : `Confirmar ${importPreview?.matched.length || 0} registros`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
