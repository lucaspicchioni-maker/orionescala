import { useState, useMemo } from 'react'
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
  Package,
  DollarSign,
  Users,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { week1Data, getWeekSummary } from '@/data/dph'
import { MAX_ORDERS_PER_PERSON } from '@/types'
import { cn, formatCurrency } from '@/lib/utils'

const PEOPLE_COLORS: Record<number, string> = {
  1: '#7CB9E8',
  2: '#22c55e',
  3: '#f59e0b',
}
const PEOPLE_COLOR_4PLUS = '#ef4444'

function getBarColor(people: number): string {
  return PEOPLE_COLORS[people] ?? PEOPLE_COLOR_4PLUS
}

const DAY_TABS = [
  { key: 'segunda', label: 'Seg' },
  { key: 'terca', label: 'Ter' },
  { key: 'quarta', label: 'Qua' },
  { key: 'quinta', label: 'Qui' },
  { key: 'sexta', label: 'Sex' },
  { key: 'sabado', label: 'Sab' },
  { key: 'domingo', label: 'Dom' },
]

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

export default function DPHPage() {
  const [selectedDay, setSelectedDay] = useState('segunda')

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

  if (!dayData) return null

  return (
    <div className="animate-fade-in space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calculo DPH</h1>
        <p className="text-sm text-muted-foreground">
          Demanda por Hora — Semana 1 Fevereiro
        </p>
      </div>

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
      <Card className="p-0 overflow-hidden">
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

        <div className="p-5">
          <h2 className="mb-1 text-lg font-semibold text-foreground">
            {dayData.dayLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            {dayData.totalOrders} pedidos | {formatCurrency(dayData.totalCost)} custo |
            CPP {formatCurrency(dayData.avgCostPerOrder)} | Pico {dayData.peakPeople} pessoas
          </p>
        </div>
      </Card>

      {/* Chart */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pedidos por Hora — {dayData.dayLabel}
        </h3>

        {/* Legend */}
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
          Detalhamento por Hora — {dayData.dayLabel}
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
              {dayData.hours.map((h, idx) => {
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
    </div>
  )
}
