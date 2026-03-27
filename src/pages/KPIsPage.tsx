import { useState, useMemo } from 'react'
import {
  Target,
  Clock,
  Zap,
  AlertCircle,
  Headphones,
  Users,
  CalendarCheck,
  Timer,
  DollarSign,
  BarChart3,
  Package,
  User,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppContext'
import type { ElementType } from 'react'

interface KPIItem {
  label: string
  value: number
  unit: string
  target?: string
  icon: ElementType
  trend: 'up' | 'down' | 'stable'
  source: 'calculated' | 'manual'
}

const TABS = [
  { key: 'colaborador', label: 'Colaborador' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'gerente', label: 'Gerente' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function KPIsPage() {
  const { state } = useApp()
  const [activeTab, setActiveTab] = useState<TabKey>('colaborador')
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all')

  const activeEmployees = useMemo(
    () => state.employees.filter((e) => e.status === 'ativo' && e.role !== 'gerente'),
    [state.employees],
  )

  // Calculate real KPIs from ponto data and schedules
  const employeeKPIs = useMemo(() => {
    return activeEmployees.map((emp) => {
      const records = state.pontoRecords.filter((p) => p.employeeId === emp.id)
      const totalRecords = records.length
      const presentRecords = records.filter((r) => r.status === 'on_time' || r.status === 'late')
      const onTimeRecords = records.filter((r) => r.status === 'on_time')
      const absentRecords = records.filter((r) => r.status === 'absent')
      const lateRecords = records.filter((r) => r.status === 'late')

      // Calculate scheduled days from all schedules
      let scheduledDays = 0
      for (const schedule of state.schedules) {
        for (const day of schedule.days) {
          const hasAssignment = day.slots.some((s) =>
            s.assignments.some((a) => a.employeeId === emp.id),
          )
          if (hasAssignment) scheduledDays++
        }
      }

      // Scheduled hours
      let scheduledHours = 0
      let workedHours = 0
      for (const schedule of state.schedules) {
        for (const day of schedule.days) {
          for (const slot of day.slots) {
            if (slot.assignments.some((a) => a.employeeId === emp.id)) {
              scheduledHours++
            }
          }
        }
      }
      workedHours = records.reduce((s, r) => s + r.workedMinutes, 0) / 60

      const assiduidade = scheduledDays > 0
        ? (presentRecords.length / scheduledDays) * 100
        : totalRecords > 0 ? (presentRecords.length / totalRecords) * 100 : 0

      const pontualidade = presentRecords.length > 0
        ? (onTimeRecords.length / presentRecords.length) * 100
        : 0

      const totalLateMinutes = records.reduce((s, r) => s + r.lateMinutes, 0)

      return {
        id: emp.id,
        name: emp.nickname || emp.name,
        assiduidade,
        pontualidade,
        totalRecords,
        presentDays: presentRecords.length,
        absentDays: absentRecords.length,
        lateDays: lateRecords.length,
        totalLateMinutes,
        scheduledDays,
        scheduledHours,
        workedHours,
      }
    })
  }, [activeEmployees, state.pontoRecords, state.schedules])

  // Aggregate KPIs
  const aggregatedKPIs = useMemo(() => {
    const withData = employeeKPIs.filter((e) => e.totalRecords > 0)
    if (withData.length === 0) return null

    const avgAssiduidade = withData.reduce((s, e) => s + e.assiduidade, 0) / withData.length
    const avgPontualidade = withData.reduce((s, e) => s + e.pontualidade, 0) / withData.length
    const totalScheduled = withData.reduce((s, e) => s + e.scheduledHours, 0)
    const totalWorked = withData.reduce((s, e) => s + e.workedHours, 0)
    const totalAbsences = withData.reduce((s, e) => s + e.absentDays, 0)
    const totalLateMinutes = withData.reduce((s, e) => s + e.totalLateMinutes, 0)

    return { avgAssiduidade, avgPontualidade, totalScheduled, totalWorked, totalAbsences, totalLateMinutes }
  }, [employeeKPIs])

  // Schedule fill rate
  const scheduleFillRate = useMemo(() => {
    let totalRequired = 0
    let totalFilled = 0
    for (const schedule of state.schedules) {
      for (const day of schedule.days) {
        for (const slot of day.slots) {
          totalRequired += slot.requiredPeople
          totalFilled += slot.assignments.length
        }
      }
    }
    return totalRequired > 0 ? (totalFilled / totalRequired) * 100 : 0
  }, [state.schedules])

  // Cost metrics
  const costMetrics = useMemo(() => {
    let totalCost = 0
    let totalHours = 0
    for (const schedule of state.schedules) {
      for (const day of schedule.days) {
        for (const slot of day.slots) {
          for (const assignment of slot.assignments) {
            const emp = state.employees.find((e) => e.id === assignment.employeeId)
            if (emp) {
              totalCost += emp.hourlyRate
              totalHours++
            }
          }
        }
      }
    }
    return { totalCost, totalHours, avgCostPerHour: totalHours > 0 ? totalCost / totalHours : 0 }
  }, [state.schedules, state.employees])

  // Build KPI items per tab
  const getKPIs = (tab: TabKey): KPIItem[] => {
    const selected = selectedEmployee !== 'all'
      ? employeeKPIs.find((e) => e.id === selectedEmployee)
      : null

    if (tab === 'colaborador') {
      if (selected) {
        return [
          {
            label: 'Assiduidade',
            value: Number(selected.assiduidade.toFixed(1)),
            unit: '%',
            target: '95%',
            icon: Target,
            trend: selected.assiduidade >= 95 ? 'up' : selected.assiduidade >= 80 ? 'stable' : 'down',
            source: selected.totalRecords > 0 ? 'calculated' : 'manual',
          },
          {
            label: 'Pontualidade',
            value: Number(selected.pontualidade.toFixed(1)),
            unit: '%',
            target: '95%',
            icon: Clock,
            trend: selected.pontualidade >= 95 ? 'up' : selected.pontualidade >= 80 ? 'stable' : 'down',
            source: selected.totalRecords > 0 ? 'calculated' : 'manual',
          },
          {
            label: 'Dias Presentes',
            value: selected.presentDays,
            unit: `de ${selected.scheduledDays}`,
            icon: CalendarCheck,
            trend: selected.absentDays === 0 ? 'up' : 'down',
            source: 'calculated',
          },
          {
            label: 'Atrasos',
            value: selected.lateDays,
            unit: `dias (${selected.totalLateMinutes}min total)`,
            icon: Timer,
            trend: selected.lateDays === 0 ? 'up' : 'down',
            source: 'calculated',
          },
          {
            label: 'Horas Trabalhadas',
            value: Number(selected.workedHours.toFixed(1)),
            unit: `de ${selected.scheduledHours}h`,
            icon: Zap,
            trend: 'stable',
            source: 'calculated',
          },
        ]
      }

      // All employees aggregate
      return [
        {
          label: 'Assiduidade Media',
          value: aggregatedKPIs ? Number(aggregatedKPIs.avgAssiduidade.toFixed(1)) : 0,
          unit: '%',
          target: '95%',
          icon: Target,
          trend: (aggregatedKPIs?.avgAssiduidade ?? 0) >= 95 ? 'up' : 'down',
          source: aggregatedKPIs ? 'calculated' : 'manual',
        },
        {
          label: 'Pontualidade Media',
          value: aggregatedKPIs ? Number(aggregatedKPIs.avgPontualidade.toFixed(1)) : 0,
          unit: '%',
          target: '95%',
          icon: Clock,
          trend: (aggregatedKPIs?.avgPontualidade ?? 0) >= 95 ? 'up' : 'down',
          source: aggregatedKPIs ? 'calculated' : 'manual',
        },
        {
          label: 'Total Ausencias',
          value: aggregatedKPIs?.totalAbsences ?? 0,
          unit: 'dias',
          icon: AlertCircle,
          trend: (aggregatedKPIs?.totalAbsences ?? 0) === 0 ? 'up' : 'down',
          source: aggregatedKPIs ? 'calculated' : 'manual',
        },
        {
          label: 'Atraso Acumulado',
          value: aggregatedKPIs?.totalLateMinutes ?? 0,
          unit: 'min',
          icon: Timer,
          trend: (aggregatedKPIs?.totalLateMinutes ?? 0) <= 30 ? 'up' : 'down',
          source: aggregatedKPIs ? 'calculated' : 'manual',
        },
        {
          label: 'Horas Trabalhadas',
          value: aggregatedKPIs ? Number(aggregatedKPIs.totalWorked.toFixed(0)) : 0,
          unit: `de ${aggregatedKPIs?.totalScheduled ?? 0}h`,
          icon: Zap,
          trend: 'stable',
          source: aggregatedKPIs ? 'calculated' : 'manual',
        },
      ]
    }

    if (tab === 'supervisor') {
      return [
        {
          label: 'Assiduidade Media Equipe',
          value: aggregatedKPIs ? Number(aggregatedKPIs.avgAssiduidade.toFixed(1)) : 0,
          unit: '%',
          target: '95%',
          icon: Users,
          trend: (aggregatedKPIs?.avgAssiduidade ?? 0) >= 95 ? 'up' : 'down',
          source: aggregatedKPIs ? 'calculated' : 'manual',
        },
        {
          label: '% Preenchimento Escala',
          value: Number(scheduleFillRate.toFixed(1)),
          unit: '%',
          target: '100%',
          icon: CalendarCheck,
          trend: scheduleFillRate >= 100 ? 'up' : scheduleFillRate >= 90 ? 'stable' : 'down',
          source: 'calculated',
        },
        {
          label: 'Total Faltas Semana',
          value: aggregatedKPIs?.totalAbsences ?? 0,
          unit: 'dias',
          icon: AlertCircle,
          trend: (aggregatedKPIs?.totalAbsences ?? 0) === 0 ? 'up' : 'down',
          source: aggregatedKPIs ? 'calculated' : 'manual',
        },
        {
          label: 'Escalas Publicadas',
          value: state.schedules.filter((s) => s.published).length,
          unit: 'semanas',
          icon: Package,
          trend: 'stable',
          source: 'calculated',
        },
        {
          label: 'Colaboradores Ativos',
          value: activeEmployees.length,
          unit: 'pessoas',
          icon: Users,
          trend: 'stable',
          source: 'calculated',
        },
      ]
    }

    // Gerente
    return [
      {
        label: 'Custo Total Semanal',
        value: Number(costMetrics.totalCost.toFixed(0)),
        unit: 'R$',
        icon: DollarSign,
        trend: 'stable',
        source: 'calculated',
      },
      {
        label: 'Custo Medio por Hora',
        value: Number(costMetrics.avgCostPerHour.toFixed(2)),
        unit: 'R$/h',
        icon: BarChart3,
        trend: 'stable',
        source: 'calculated',
      },
      {
        label: 'Horas Totais Alocadas',
        value: costMetrics.totalHours,
        unit: 'h',
        icon: Clock,
        trend: 'stable',
        source: 'calculated',
      },
      {
        label: 'Taxa Assiduidade',
        value: aggregatedKPIs ? Number(aggregatedKPIs.avgAssiduidade.toFixed(1)) : 0,
        unit: '%',
        target: '95%',
        icon: Target,
        trend: (aggregatedKPIs?.avgAssiduidade ?? 0) >= 95 ? 'up' : 'down',
        source: aggregatedKPIs ? 'calculated' : 'manual',
      },
      {
        label: 'Preenchimento Escala',
        value: Number(scheduleFillRate.toFixed(1)),
        unit: '%',
        target: '100%',
        icon: Headphones,
        trend: scheduleFillRate >= 100 ? 'up' : 'down',
        source: 'calculated',
      },
    ]
  }

  const metrics = getKPIs(activeTab)
  const hasNoData = state.pontoRecords.length === 0

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">KPIs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Indicadores calculados a partir dos dados reais de ponto e escala
          </p>
        </div>

        {activeTab === 'colaborador' && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="all">Todos os Colaboradores</option>
              {activeEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nickname || emp.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Card className="p-0 overflow-hidden">
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative flex-1 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* No data warning */}
      {hasNoData && (
        <Card variant="glass">
          <div className="flex items-center gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="font-medium text-foreground">Sem dados de ponto registrados</p>
              <p className="text-muted-foreground">
                Use a aba <span className="font-semibold text-primary">Ponto</span> para registrar
                check-in/check-out dos colaboradores. Os KPIs serao calculados automaticamente.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="relative">
            <MetricCard
              label={m.label}
              value={m.value}
              unit={m.unit}
              icon={m.icon}
              trend={m.trend}
              subtitle={m.target ? `Meta: ${m.target}` : undefined}
            />
            <div className="absolute right-3 top-3 flex gap-1">
              {m.target && (
                <Badge
                  variant={m.trend === 'up' ? 'success' : m.trend === 'down' ? 'warning' : 'muted'}
                  size="sm"
                >
                  {m.target}
                </Badge>
              )}
              <Badge variant={m.source === 'calculated' ? 'default' : 'muted'} size="sm">
                {m.source === 'calculated' ? 'Real' : 'Sem dados'}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Individual employee KPIs table */}
      {activeTab === 'colaborador' && selectedEmployee === 'all' && employeeKPIs.length > 0 && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Detalhamento por Colaborador
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5">Nome</th>
                  <th className="px-3 py-2.5 text-center">Assiduidade</th>
                  <th className="px-3 py-2.5 text-center">Pontualidade</th>
                  <th className="px-3 py-2.5 text-center">Presencas</th>
                  <th className="px-3 py-2.5 text-center">Faltas</th>
                  <th className="px-3 py-2.5 text-center">Atrasos</th>
                  <th className="px-3 py-2.5 text-center">Horas</th>
                </tr>
              </thead>
              <tbody>
                {employeeKPIs.map((emp) => (
                  <tr key={emp.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium text-foreground">{emp.name}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        'font-semibold',
                        emp.assiduidade >= 95 ? 'text-success' : emp.assiduidade >= 80 ? 'text-warning' : 'text-destructive',
                      )}>
                        {emp.totalRecords > 0 ? `${emp.assiduidade.toFixed(0)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        'font-semibold',
                        emp.pontualidade >= 95 ? 'text-success' : emp.pontualidade >= 80 ? 'text-warning' : 'text-destructive',
                      )}>
                        {emp.totalRecords > 0 ? `${emp.pontualidade.toFixed(0)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-success">{emp.presentDays}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={emp.absentDays > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                        {emp.absentDays}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={emp.lateDays > 0 ? 'text-warning' : 'text-muted-foreground'}>
                        {emp.lateDays} ({emp.totalLateMinutes}min)
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">
                      {emp.workedHours > 0 ? `${emp.workedHours.toFixed(1)}h` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Info */}
      <Card variant="glass">
        <p className="text-xs text-muted-foreground">
          KPIs de <span className="font-semibold text-success">Assiduidade</span> e{' '}
          <span className="font-semibold text-success">Pontualidade</span> sao calculados
          automaticamente a partir dos registros de ponto. Indicadores como{' '}
          <span className="text-accent">Produtividade</span>,{' '}
          <span className="text-accent">Erros</span> e{' '}
          <span className="text-accent">SLA</span> serao conectados ao admin.orion futuramente.
        </p>
      </Card>
    </div>
  )
}
