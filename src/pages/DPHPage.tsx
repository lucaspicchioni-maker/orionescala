import { useState, useMemo, useCallback, useRef } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  Upload,
  Calculator,
  FileSpreadsheet,
  Download,
  BarChart3,
  ArrowRight,
  Check,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Table,
  TrendingUp,
  Package,
  DollarSign,
  Users,
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { MetricCard } from '@/components/ui/MetricCard'
import { cn, formatCurrency } from '@/lib/utils'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { week1Data, getWeekSummary } from '@/data/dph'
import { MAX_ORDERS_PER_PERSON } from '@/types'

// ── Constants ──────────────────────────────────────────────────────────

const HOUR_LABELS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
  '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00',
  '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00',
  '21:00-22:00', '22:00-23:00', '23:00-00:00', '00:00-01:00',
]

const DAY_KEYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const
const DAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
const DAY_LABELS_MAP: Record<string, string> = {
  segunda: 'Segunda-feira',
  terca: 'Terca-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
  sabado: 'Sabado',
  domingo: 'Domingo',
}

const PEOPLE_COLORS: Record<number, string> = {
  1: '#7CB9E8',
  2: '#22c55e',
  3: '#f59e0b',
}
const PEOPLE_COLOR_4PLUS = '#ef4444'

function getBarColor(people: number): string {
  return PEOPLE_COLORS[people] ?? PEOPLE_COLOR_4PLUS
}

function getInputCellColor(orders: number): string {
  if (orders === 0) return ''
  if (orders <= 20) return 'bg-blue-500/10'
  if (orders <= 50) return 'bg-green-500/10'
  if (orders <= 80) return 'bg-orange-500/10'
  return 'bg-red-500/10'
}

type OrderGrid = number[][] // [hourIndex][dayIndex]

function createEmptyGrid(): OrderGrid {
  return HOUR_LABELS.map(() => DAY_KEYS.map(() => 0))
}

function gridFromWeek1(): OrderGrid {
  return HOUR_LABELS.map((_, hourIdx) =>
    DAY_KEYS.map((dayKey) => {
      const dayData = week1Data.find((d) => d.day === dayKey)
      return dayData?.hours[hourIdx]?.orders ?? 0
    }),
  )
}

// ── Tab types ──────────────────────────────────────────────────────────

type MainTab = 'current' | 'projection'
type InputMode = 'manual' | 'import'

// ── Chart Tooltip ──────────────────────────────────────────────────────

interface ChartPayload {
  hour: string
  orders: number
  people: number
  ordersPerPerson: number
  costPerHour: number
  costPerOrder: number
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: ChartPayload }[]
}) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-xl">
      <p className="mb-1 font-semibold text-foreground">{d.hour}</p>
      <div className="space-y-0.5 text-muted-foreground">
        <p>Pedidos: <span className="text-foreground">{d.orders}</span></p>
        <p>Pessoas: <span className="text-foreground">{d.people}</span></p>
        <p>Ped/Pessoa: <span className="text-foreground">{d.ordersPerPerson}</span></p>
        <p>Custo/Hora: <span className="text-foreground">{formatCurrency(d.costPerHour)}</span></p>
        <p>CPP: <span className="text-foreground">{formatCurrency(d.costPerOrder)}</span></p>
      </div>
    </div>
  )
}

function StatusIcon({ ordersPerPerson }: { ordersPerPerson: number }) {
  if (ordersPerPerson > MAX_ORDERS_PER_PERSON) {
    return <AlertOctagon className="h-4 w-4 text-destructive" />
  }
  if (ordersPerPerson > 30) {
    return <AlertTriangle className="h-4 w-4 text-warning" />
  }
  return <CheckCircle2 className="h-4 w-4 text-success" />
}

function PeopleBadge({ count }: { count: number }) {
  const variant =
    count <= 1 ? 'muted' : count === 2 ? 'success' : count === 3 ? 'warning' : 'destructive'
  return <Badge variant={variant}>{count}p</Badge>
}

// ── Day Tabs for current data ──────────────────────────────────────────

const DAY_TABS = DAY_KEYS.map((key, i) => ({ key, label: DAY_SHORT[i] }))

// ── Main Component ─────────────────────────────────────────────────────

export default function DPHPage() {
  const { state } = useApp()
  const [mainTab, setMainTab] = useState<MainTab>('current')

  // Current data tab state
  const [selectedDay, setSelectedDay] = useState('segunda')

  // Projection state
  const [inputMode, setInputMode] = useState<InputMode>('manual')
  const [orderGrid, setOrderGrid] = useState<OrderGrid>(createEmptyGrid)
  const [projectionDay, setProjectionDay] = useState('segunda')
  const [showResults, setShowResults] = useState(false)
  const [applied, setApplied] = useState(false)
  const [csvPreview, setCsvPreview] = useState<OrderGrid | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [, setProjection] = useLocalStorage<OrderGrid | null>('orion_dph_projection', null)

  // Average hourly rate from employees
  const avgHourlyRate = useMemo(() => {
    const active = state.employees.filter((e) => e.status === 'ativo')
    if (active.length === 0) return 15
    return active.reduce((sum, e) => sum + e.hourlyRate, 0) / active.length
  }, [state.employees])

  // ── Current data computations ──────────────────────────────────────

  const summary = useMemo(() => getWeekSummary(), [])

  const dayData = useMemo(
    () => week1Data.find((d) => d.day === selectedDay),
    [selectedDay],
  )

  const weekPeakPeople = useMemo(
    () => Math.max(...week1Data.map((d) => d.peakPeople)),
    [],
  )

  const chartData = useMemo(() => {
    if (!dayData) return []
    return dayData.hours.map((h) => ({
      hour: h.hour.split('-')[0],
      orders: h.orders,
      people: h.people,
      ordersPerPerson: h.ordersPerPerson,
      costPerHour: h.costPerHour,
      costPerOrder: h.costPerOrder,
    }))
  }, [dayData])

  const peakByDay = useMemo(() => {
    const map: Record<string, number> = {}
    week1Data.forEach((d) => {
      map[d.day] = d.peakPeople
    })
    return map
  }, [])

  // ── Projection computations ────────────────────────────────────────

  const hasAnyData = useMemo(
    () => orderGrid.some((row) => row.some((v) => v > 0)),
    [orderGrid],
  )

  const projectionResults = useMemo(() => {
    if (!hasAnyData) return null

    const dayIdx = DAY_KEYS.indexOf(projectionDay as typeof DAY_KEYS[number])
    const hours = HOUR_LABELS.map((hour, hourIdx) => {
      const orders = orderGrid[hourIdx][dayIdx]
      const hourNum = parseInt(hour.split(':')[0], 10)
      const isLunch = hourNum >= 12 && hourNum < 14

      let people = orders > 0 ? Math.ceil(orders / MAX_ORDERS_PER_PERSON) : 0
      if (isLunch && people > 0 && people < 2) people = 2
      if (people > 0 && people < 1) people = 1

      const costPerHour = people * avgHourlyRate
      const ordersPerPerson = people > 0 ? Math.round(orders / people) : 0
      const costPerOrder = orders > 0 ? costPerHour / orders : 0

      return {
        hour,
        orders,
        people,
        ordersPerPerson,
        costPerHour,
        costPerOrder,
      }
    })

    const totalOrders = hours.reduce((s, h) => s + h.orders, 0)
    const totalCost = hours.reduce((s, h) => s + h.costPerHour, 0)
    const peakPeople = Math.max(...hours.map((h) => h.people))

    return {
      hours,
      totalOrders,
      totalCost,
      avgCostPerOrder: totalOrders > 0 ? totalCost / totalOrders : 0,
      peakPeople,
    }
  }, [orderGrid, projectionDay, avgHourlyRate, hasAnyData])

  const projectionChartData = useMemo(() => {
    if (!projectionResults) return []
    return projectionResults.hours.map((h) => ({
      hour: h.hour.split('-')[0],
      orders: h.orders,
      people: h.people,
      ordersPerPerson: h.ordersPerPerson,
      costPerHour: h.costPerHour,
      costPerOrder: h.costPerOrder,
    }))
  }, [projectionResults])

  // Shift gap warnings
  const shiftWarnings = useMemo(() => {
    if (!projectionResults) return []
    const warnings: string[] = []
    const hours = projectionResults.hours

    let gapStart = -1
    for (let i = 0; i < hours.length; i++) {
      if (hours[i].people === 0) {
        if (gapStart === -1) gapStart = i
      } else {
        if (gapStart !== -1) {
          const gapLen = i - gapStart
          if (gapLen >= 1 && gapLen <= 2) {
            // Check if there are people before and after
            const hasBefore = gapStart > 0 && hours[gapStart - 1].people > 0
            const hasAfter = hours[i].people > 0
            if (hasBefore && hasAfter) {
              warnings.push(
                `Intervalo de ${gapLen}h entre ${HOUR_LABELS[gapStart]} e ${HOUR_LABELS[i - 1]} — turnos minimos de 3h`,
              )
            }
          }
          gapStart = -1
        }
      }
    }
    return warnings
  }, [projectionResults])

  // Running totals
  const dayTotals = useMemo(
    () => DAY_KEYS.map((_, dIdx) => orderGrid.reduce((sum, row) => sum + row[dIdx], 0)),
    [orderGrid],
  )

  const hourTotals = useMemo(
    () => orderGrid.map((row) => row.reduce((sum, v) => sum + v, 0)),
    [orderGrid],
  )

  // ── Handlers ───────────────────────────────────────────────────────

  const handleCellChange = useCallback((hourIdx: number, dayIdx: number, value: string) => {
    const num = parseInt(value, 10)
    setOrderGrid((prev) => {
      const next = prev.map((row) => [...row])
      next[hourIdx][dayIdx] = isNaN(num) ? 0 : Math.max(0, num)
      return next
    })
    setShowResults(false)
    setApplied(false)
  }, [])

  const fillWithPrevious = useCallback(() => {
    setOrderGrid(gridFromWeek1())
    setShowResults(false)
    setApplied(false)
  }, [])

  const clearGrid = useCallback(() => {
    setOrderGrid(createEmptyGrid())
    setShowResults(false)
    setApplied(false)
    setCsvPreview(null)
  }, [])

  const calculateProjection = useCallback(() => {
    setShowResults(true)
  }, [])

  const applyProjection = useCallback(() => {
    setProjection(orderGrid)
    setApplied(true)
    setTimeout(() => setApplied(false), 4000)
  }, [orderGrid, setProjection])

  // CSV parsing
  const parseCSV = useCallback((text: string): OrderGrid | null => {
    try {
      const lines = text.trim().split('\n').filter((l) => l.trim())
      if (lines.length < 2) return null

      const grid = createEmptyGrid()
      // Skip header line
      for (let i = 1; i < lines.length && i <= HOUR_LABELS.length; i++) {
        const cells = lines[i].split(/[,;\t]/)
        for (let d = 0; d < DAY_KEYS.length && d + 1 < cells.length; d++) {
          const val = parseInt(cells[d + 1]?.trim() ?? '0', 10)
          grid[i - 1][d] = isNaN(val) ? 0 : Math.max(0, val)
        }
      }
      return grid
    } catch {
      return null
    }
  }, [])

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        if (parsed) {
          setCsvPreview(parsed)
        }
      }
      reader.readAsText(file)
    },
    [parseCSV],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const confirmImport = useCallback(() => {
    if (csvPreview) {
      setOrderGrid(csvPreview)
      setCsvPreview(null)
      setShowResults(false)
      setApplied(false)
    }
  }, [csvPreview])

  const exportCSV = useCallback(() => {
    if (!projectionResults) return

    let csv = 'Horario,Pedidos,Pessoas,Ped/Pessoa,Custo/Hora,CPP\n'
    projectionResults.hours.forEach((h) => {
      csv += `${h.hour},${h.orders},${h.people},${h.ordersPerPerson},${h.costPerHour.toFixed(2)},${h.costPerOrder.toFixed(2)}\n`
    })
    csv += `\nTotal,${projectionResults.totalOrders},,,"${formatCurrency(projectionResults.totalCost)}","${formatCurrency(projectionResults.avgCostPerOrder)}"\n`

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dph-projecao-${projectionDay}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [projectionResults, projectionDay])

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            Calculo DPH
          </h1>
          <p className="text-sm text-muted-foreground">
            Demanda por Hora — Analise e Projecao
          </p>
        </div>

        {/* Main Tab Selector */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          <button
            onClick={() => setMainTab('current')}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
              mainTab === 'current'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <BarChart3 className="h-4 w-4" />
            Dados Atuais
          </button>
          <button
            onClick={() => setMainTab('projection')}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
              mainTab === 'projection'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Calculator className="h-4 w-4" />
            Nova Projecao
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TAB 1 — Dados Atuais                                          */}
      {/* ════════════════════════════════════════════════════════════════ */}

      {mainTab === 'current' && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Pedidos"
              value={summary.totalOrders}
              icon={Package}
              subtitle="semana"
              trend="up"
            />
            <MetricCard
              label="Custo Medio/Pedido"
              value={Number(summary.avgCPP.toFixed(2))}
              unit="R$"
              icon={DollarSign}
              subtitle="CPP semanal"
              trend="stable"
            />
            <MetricCard
              label="Custo Total Semanal"
              value={Number(summary.totalCost.toFixed(0))}
              unit="R$"
              icon={TrendingUp}
              subtitle={formatCurrency(summary.totalCost)}
              trend="stable"
            />
            <MetricCard
              label="Pico de Pessoas"
              value={weekPeakPeople}
              icon={Users}
              subtitle="max simultaneo na semana"
              trend="up"
            />
          </div>

          {/* Day Selector */}
          <Card className="overflow-hidden p-0">
            <div className="flex border-b border-border">
              {DAY_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedDay(tab.key)}
                  className={cn(
                    'relative flex flex-1 flex-col items-center gap-1 px-3 py-3 text-sm font-medium transition-colors',
                    selectedDay === tab.key
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span>{tab.label}</span>
                  <Badge
                    variant={selectedDay === tab.key ? 'default' : 'muted'}
                    size="sm"
                  >
                    {peakByDay[tab.key]}p
                  </Badge>
                  {selectedDay === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {dayData && (
              <div className="p-5">
                <h2 className="mb-1 text-lg font-semibold text-foreground">
                  {dayData.dayLabel}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {dayData.totalOrders} pedidos | {formatCurrency(dayData.totalCost)} custo |
                  CPP {formatCurrency(dayData.avgCostPerOrder)} | Pico {dayData.peakPeople} pessoas
                </p>
              </div>
            )}
          </Card>

          {/* Chart */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Pedidos por Hora — {dayData?.dayLabel}
            </h3>

            <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded" style={{ background: '#7CB9E8' }} />
                1 pessoa
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded" style={{ background: '#22c55e' }} />
                2 pessoas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded" style={{ background: '#f59e0b' }} />
                3 pessoas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded" style={{ background: '#ef4444' }} />
                4+ pessoas
              </span>
            </div>

            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: 'hsl(210 2% 60%)', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(0 0% 15%)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'hsl(210 2% 60%)', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(0 0% 15%)' }}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(0 0% 100% / 0.04)' }} />
                <ReferenceLine
                  y={MAX_ORDERS_PER_PERSON}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: `Limite ${MAX_ORDERS_PER_PERSON}/pessoa`,
                    fill: '#ef4444',
                    fontSize: 11,
                    position: 'right',
                  }}
                />
                <Bar dataKey="orders" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={getBarColor(entry.people)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Table */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Detalhamento por Hora — {dayData?.dayLabel}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5">Horario</th>
                    <th className="px-3 py-2.5 text-right">Pedidos</th>
                    <th className="px-3 py-2.5 text-center">Pessoas</th>
                    <th className="px-3 py-2.5 text-right">Ped/Pessoa</th>
                    <th className="px-3 py-2.5">Limite/Pessoa</th>
                    <th className="px-3 py-2.5 text-right">Custo/Hora</th>
                    <th className="px-3 py-2.5 text-right">CPP</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dayData?.hours.map((h, idx) => {
                    const pct =
                      h.people > 0
                        ? Math.min(
                            (h.ordersPerPerson / MAX_ORDERS_PER_PERSON) * 100,
                            100,
                          )
                        : 0

                    return (
                      <tr
                        key={idx}
                        className={cn(
                          'border-b border-border/50 transition-colors hover:bg-muted/30',
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10',
                        )}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {h.hour}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                          {h.orders}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <PeopleBadge count={h.people} />
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-right font-medium',
                            h.ordersPerPerson > MAX_ORDERS_PER_PERSON
                              ? 'text-destructive'
                              : h.ordersPerPerson > 30
                                ? 'text-warning'
                                : 'text-foreground',
                          )}
                        >
                          {h.ordersPerPerson}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: getBarColor(h.people),
                                }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {formatCurrency(h.costPerHour)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {formatCurrency(h.costPerOrder)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusIcon ordersPerPerson={h.ordersPerPerson} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TAB 2 — Nova Projecao                                         */}
      {/* ════════════════════════════════════════════════════════════════ */}

      {mainTab === 'projection' && (
        <>
          {/* Applied confirmation banner */}
          {applied && (
            <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4 animate-fade-in">
              <Check className="h-5 w-5 text-success" />
              <p className="text-sm font-medium text-success">
                Projecao aplicada com sucesso! Os dados serao usados na pagina de Escala.
              </p>
            </div>
          )}

          {/* Step 1 — Input de Dados */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Input de Dados
                </h3>
              </div>

              {/* Input mode toggle */}
              <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                <button
                  onClick={() => setInputMode('manual')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                    inputMode === 'manual'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Table className="h-3.5 w-3.5" />
                  Inserir Manualmente
                </button>
                <button
                  onClick={() => setInputMode('import')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                    inputMode === 'import'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Importar Planilha
                </button>
              </div>
            </div>

            {inputMode === 'manual' && (
              <>
                {/* Action buttons */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={fillWithPrevious}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Preencher com dados anteriores
                  </button>
                  <button
                    onClick={clearGrid}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Limpar
                  </button>
                </div>

                {/* Order input grid */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-2 text-left">Horario</th>
                        {DAY_SHORT.map((d) => (
                          <th key={d} className="px-1 py-2 text-center">{d}</th>
                        ))}
                        <th className="px-2 py-2 text-center text-primary">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HOUR_LABELS.map((hour, hIdx) => (
                        <tr key={hour} className="border-b border-border/30">
                          <td className="px-2 py-1 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {hour}
                          </td>
                          {DAY_KEYS.map((_, dIdx) => (
                            <td key={dIdx} className="px-1 py-1">
                              <input
                                type="number"
                                min={0}
                                value={orderGrid[hIdx][dIdx] || ''}
                                onChange={(e) => handleCellChange(hIdx, dIdx, e.target.value)}
                                className={cn(
                                  'w-full min-w-[48px] rounded border border-border bg-input px-2 py-1 text-center text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30',
                                  getInputCellColor(orderGrid[hIdx][dIdx]),
                                )}
                                placeholder="0"
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-center text-xs font-semibold text-primary">
                            {hourTotals[hIdx]}
                          </td>
                        </tr>
                      ))}
                      {/* Day totals row */}
                      <tr className="border-t-2 border-border">
                        <td className="px-2 py-2 text-xs font-semibold text-primary">Total</td>
                        {dayTotals.map((total, dIdx) => (
                          <td key={dIdx} className="px-1 py-2 text-center text-xs font-semibold text-primary">
                            {total}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center text-xs font-bold text-primary">
                          {dayTotals.reduce((s, v) => s + v, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {inputMode === 'import' && (
              <div className="space-y-4">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors',
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border text-muted-foreground hover:border-muted-foreground',
                  )}
                >
                  <Upload className={cn('h-10 w-10', dragOver ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      Arraste um arquivo CSV aqui ou clique para selecionar
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Formato: primeira coluna = horario, depois uma coluna por dia com quantidade de pedidos
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {/* CSV Preview */}
                {csvPreview && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Pre-visualizacao dos dados:</h4>
                    <div className="max-h-[300px] overflow-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                            <th className="px-2 py-1.5 text-left">Horario</th>
                            {DAY_SHORT.map((d) => (
                              <th key={d} className="px-2 py-1.5 text-center">{d}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.map((row, hIdx) => (
                            <tr key={hIdx} className="border-b border-border/30">
                              <td className="px-2 py-1 font-mono text-muted-foreground">
                                {HOUR_LABELS[hIdx]}
                              </td>
                              {row.map((val, dIdx) => (
                                <td key={dIdx} className={cn('px-2 py-1 text-center', getInputCellColor(val))}>
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={confirmImport}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <Check className="h-4 w-4" />
                        Importar
                      </button>
                      <button
                        onClick={() => setCsvPreview(null)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Step 2 — Calculo Automatico */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Calculo Automatico
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  Taxa media: {formatCurrency(avgHourlyRate)}/h
                </p>
                <button
                  onClick={calculateProjection}
                  disabled={!hasAnyData}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                    hasAnyData
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'cursor-not-allowed bg-muted text-muted-foreground',
                  )}
                >
                  <Calculator className="h-4 w-4" />
                  Calcular
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!hasAnyData && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Insira dados de pedidos acima para calcular a projecao.
              </p>
            )}

            {showResults && projectionResults && (
              <div className="space-y-6 animate-fade-in">
                {/* Day selector for projection results */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Visualizar dia:</span>
                  {DAY_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setProjectionDay(tab.key)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                        projectionDay === tab.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <Badge variant="success" size="sm" className="ml-2">
                    <Check className="mr-1 h-3 w-3" />
                    Calculado
                  </Badge>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Pedidos</p>
                    <p className="text-xl font-bold text-foreground">{projectionResults.totalOrders}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Custo Total</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(projectionResults.totalCost)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">CPP</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(projectionResults.avgCostPerOrder)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Pico Pessoas</p>
                    <p className="text-xl font-bold text-foreground">{projectionResults.peakPeople}</p>
                  </div>
                </div>

                {/* Shift warnings */}
                {shiftWarnings.length > 0 && (
                  <div className="space-y-2">
                    {shiftWarnings.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                        <p className="text-xs text-warning">{w}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chart */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
                    Pedidos por Hora — {DAY_LABELS_MAP[projectionDay]}
                  </h4>

                  <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded" style={{ background: '#7CB9E8' }} />
                      1 pessoa
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded" style={{ background: '#22c55e' }} />
                      2 pessoas
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded" style={{ background: '#f59e0b' }} />
                      3 pessoas
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded" style={{ background: '#ef4444' }} />
                      4+ pessoas
                    </span>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={projectionChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fill: 'hsl(210 2% 60%)', fontSize: 11 }}
                        axisLine={{ stroke: 'hsl(0 0% 15%)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'hsl(210 2% 60%)', fontSize: 11 }}
                        axisLine={{ stroke: 'hsl(0 0% 15%)' }}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(0 0% 100% / 0.04)' }} />
                      <ReferenceLine
                        y={MAX_ORDERS_PER_PERSON}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{
                          value: `Limite ${MAX_ORDERS_PER_PERSON}/pessoa`,
                          fill: '#ef4444',
                          fontSize: 11,
                          position: 'right',
                        }}
                      />
                      <Bar dataKey="orders" radius={[4, 4, 0, 0]} maxBarSize={36}>
                        {projectionChartData.map((entry, idx) => (
                          <Cell key={idx} fill={getBarColor(entry.people)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Results table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2.5">Horario</th>
                        <th className="px-3 py-2.5 text-right">Pedidos</th>
                        <th className="px-3 py-2.5 text-center">Pessoas</th>
                        <th className="px-3 py-2.5 text-right">Ped/Pessoa</th>
                        <th className="px-3 py-2.5">Limite/Pessoa</th>
                        <th className="px-3 py-2.5 text-right">Custo/Hora</th>
                        <th className="px-3 py-2.5 text-right">CPP</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectionResults.hours.map((h, idx) => {
                        const pct =
                          h.people > 0
                            ? Math.min(
                                (h.ordersPerPerson / MAX_ORDERS_PER_PERSON) * 100,
                                100,
                              )
                            : 0

                        return (
                          <tr
                            key={idx}
                            className={cn(
                              'border-b border-border/50 transition-colors hover:bg-muted/30',
                              idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10',
                            )}
                          >
                            <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                              {h.hour}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                              {h.orders}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <PeopleBadge count={h.people} />
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2.5 text-right font-medium',
                                h.ordersPerPerson > MAX_ORDERS_PER_PERSON
                                  ? 'text-destructive'
                                  : h.ordersPerPerson > 30
                                    ? 'text-warning'
                                    : 'text-foreground',
                              )}
                            >
                              {h.ordersPerPerson}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: getBarColor(h.people),
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(pct)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">
                              {formatCurrency(h.costPerHour)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">
                              {formatCurrency(h.costPerOrder)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <StatusIcon ordersPerPerson={h.ordersPerPerson} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          {/* Step 3 — Aplicar Projecao */}
          {showResults && projectionResults && (
            <Card variant="glass">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-sm font-bold text-primary">3</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Aplicar Projecao
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Salvar o calculo para uso na pagina de Escala
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={exportCSV}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <Download className="h-4 w-4" />
                    Exportar Resultado
                  </button>
                  <button
                    onClick={applyProjection}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
                  >
                    <Check className="h-4 w-4" />
                    Aplicar a Escala
                  </button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
