import { useState, useMemo } from 'react'
import { DollarSign, TrendingUp, ChevronLeft, ChevronRight, Users, AlertTriangle, Target, BarChart3 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useApp } from '@/store/AppContext'
import { cn, formatCurrency } from '@/lib/utils'

// ── Helpers ──────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${fmt(monday)} - ${fmt(sunday)}`
}

const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']

// ── Component ────────────────────────────────────────────────────────

export default function CustosOperacionaisPage() {
  const { state } = useApp()
  const [weekOffset, setWeekOffset] = useState(0)

  const currentMonday = useMemo(() => {
    const base = getMonday(new Date())
    return addDays(base, weekOffset * 7)
  }, [weekOffset])

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toISO(addDays(currentMonday, i))),
    [currentMonday],
  )

  const weekStart = toISO(currentMonday)

  // ── Data aggregation ───────────────────────────────────────────────

  const employeeCosts = useMemo(() => {
    const activeEmployees = state.employees.filter((e) => e.status === 'ativo')

    return activeEmployees.map((emp) => {
      // Scheduled hours from schedule slots
      const schedule = state.schedules.find((s) => s.weekStart === weekStart)
      let scheduledHours = 0
      if (schedule) {
        for (const day of schedule.days) {
          if (!weekDates.includes(day.date)) continue
          for (const slot of day.slots) {
            const assigned = slot.assignments.some((a) => a.employeeId === emp.id)
            if (assigned) scheduledHours += 1 // each slot = 1 hour
          }
        }
      }

      // Worked hours from ponto
      const pontoRecords = state.pontoRecords.filter(
        (p) => p.employeeId === emp.id && weekDates.includes(p.date),
      )
      const workedMinutes = pontoRecords.reduce((sum, p) => sum + p.workedMinutes, 0)
      const workedHours = workedMinutes / 60

      // Cost calculations
      const normalCost = scheduledHours * emp.hourlyRate
      const overtimeHours = Math.max(0, workedHours - 44)
      const overtimeCost = overtimeHours * emp.hourlyRate * 1.5

      // Productivity / errors
      const prodRecords = state.productivityRecords.filter(
        (pr) => pr.employeeId === emp.id && weekDates.includes(pr.date),
      )
      const errorCost = prodRecords.reduce((sum, pr) => sum + pr.errorCost, 0)
      const totalOrders = prodRecords.reduce((sum, pr) => sum + pr.totalOrders, 0)

      const totalCost = normalCost + overtimeCost + errorCost

      return {
        employee: emp,
        scheduledHours,
        workedHours: Math.round(workedHours * 10) / 10,
        normalCost,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        overtimeCost,
        errorCost,
        totalOrders,
        totalCost,
      }
    }).sort((a, b) => b.totalCost - a.totalCost)
  }, [state.employees, state.schedules, state.pontoRecords, state.productivityRecords, weekStart, weekDates])

  // ── Summary metrics ────────────────────────────────────────────────

  const summary = useMemo(() => {
    const totalFolha = employeeCosts.reduce((s, e) => s + e.normalCost, 0)
    const totalHE = employeeCosts.reduce((s, e) => s + e.overtimeCost, 0)
    const totalErros = employeeCosts.reduce((s, e) => s + e.errorCost, 0)
    const totalOrders = employeeCosts.reduce((s, e) => s + e.totalOrders, 0)
    const totalCost = employeeCosts.reduce((s, e) => s + e.totalCost, 0)
    const costPerOrder = totalOrders > 0 ? totalCost / totalOrders : 0

    return { totalFolha, totalHE, totalErros, totalOrders, totalCost, costPerOrder }
  }, [employeeCosts])

  // ── Day-by-day cost breakdown ──────────────────────────────────────

  const dailyCosts = useMemo(() => {
    return weekDates.map((date, i) => {
      let cost = 0
      for (const ec of employeeCosts) {
        // Ponto-based cost for the day
        const dayPonto = state.pontoRecords.filter(
          (p) => p.employeeId === ec.employee.id && p.date === date,
        )
        const dayMinutes = dayPonto.reduce((s, p) => s + p.workedMinutes, 0)
        const dayCost = (dayMinutes / 60) * ec.employee.hourlyRate

        // Error cost for the day
        const dayProd = state.productivityRecords.filter(
          (pr) => pr.employeeId === ec.employee.id && pr.date === date,
        )
        const dayError = dayProd.reduce((s, pr) => s + pr.errorCost, 0)

        cost += dayCost + dayError
      }
      return { date, dayName: DAY_NAMES[i], cost }
    })
  }, [weekDates, employeeCosts, state.pontoRecords, state.productivityRecords])

  const maxDailyCost = Math.max(...dailyCosts.map((d) => d.cost), 1)

  // ── ROI data ───────────────────────────────────────────────────────

  const roiData = useMemo(() => {
    return employeeCosts
      .filter((ec) => ec.totalCost > 0 || ec.totalOrders > 0)
      .map((ec) => {
        const roi = ec.totalCost > 0 ? ec.totalOrders / ec.totalCost : 0
        return { ...ec, roi }
      })
      .sort((a, b) => b.roi - a.roi)
  }, [employeeCosts])

  // ── Payroll projection ─────────────────────────────────────────────

  const monthlyProjection = useMemo(() => {
    return summary.totalCost * 4.33 // avg weeks per month
  }, [summary.totalCost])

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header + Week Navigator */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custos Operacionais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle financeiro semanal da operacao
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft size={20} className="text-muted-foreground" />
          </button>
          <span className="text-sm font-medium text-foreground min-w-[140px] text-center">
            {formatWeekLabel(currentMonday)}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
          >
            <ChevronRight size={20} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <DollarSign size={20} className="text-blue-400" />
            </div>
            <span className="text-xs text-muted-foreground">Custo Total Folha</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.totalFolha)}</p>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <AlertTriangle size={20} className="text-orange-400" />
            </div>
            <span className="text-xs text-muted-foreground">Custo Hora Extra</span>
          </div>
          <p className={cn('text-2xl font-bold', summary.totalHE > 0 ? 'text-red-400' : 'text-green-400')}>
            {formatCurrency(summary.totalHE)}
          </p>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <span className="text-xs text-muted-foreground">Custo Reembolsos (erros)</span>
          </div>
          <p className={cn('text-2xl font-bold', summary.totalErros > 0 ? 'text-red-400' : 'text-green-400')}>
            {formatCurrency(summary.totalErros)}
          </p>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Target size={20} className="text-purple-400" />
            </div>
            <span className="text-xs text-muted-foreground">Custo por Pedido</span>
          </div>
          <p className={cn('text-2xl font-bold', summary.costPerOrder > 5 ? 'text-red-400' : 'text-green-400')}>
            {formatCurrency(summary.costPerOrder)}
          </p>
        </Card>
      </div>

      {/* Section 2: Day-by-Day Cost Breakdown (CSS Bar Chart) */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-blue-400" />
          <h2 className="text-lg font-semibold text-foreground">Custo Diario</h2>
        </div>
        <div className="space-y-3">
          {dailyCosts.map((day) => {
            const pct = maxDailyCost > 0 ? (day.cost / maxDailyCost) * 100 : 0
            return (
              <div key={day.date} className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground w-10 shrink-0">
                  {day.dayName}
                </span>
                <div className="flex-1 h-8 bg-muted/30 rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-md transition-all duration-500"
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                  {day.cost > 0 && (
                    <span className="absolute inset-y-0 right-2 flex items-center text-xs font-medium text-foreground">
                      {formatCurrency(day.cost)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border flex justify-between text-sm">
          <span className="text-muted-foreground">Total Semanal</span>
          <span className="font-bold text-foreground text-lg">{formatCurrency(summary.totalCost)}</span>
        </div>
      </Card>

      {/* Section 3: Employee Cost Breakdown Table */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Users size={20} className="text-green-400" />
          <h2 className="text-lg font-semibold text-foreground">Custos por Colaborador</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">Nome</th>
                <th className="text-right py-2 px-2 font-medium">Horas Esc.</th>
                <th className="text-right py-2 px-2 font-medium">Custo Normal</th>
                <th className="text-right py-2 px-2 font-medium">Horas Extra</th>
                <th className="text-right py-2 px-2 font-medium">Custo HE (1.5x)</th>
                <th className="text-right py-2 px-2 font-medium">Custo Total</th>
              </tr>
            </thead>
            <tbody>
              {employeeCosts.map((ec) => (
                <tr
                  key={ec.employee.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="py-2 px-2 font-medium text-foreground">
                    {ec.employee.nickname || ec.employee.name}
                  </td>
                  <td className="py-2 px-2 text-right text-muted-foreground">
                    {ec.scheduledHours}h
                  </td>
                  <td className="py-2 px-2 text-right text-foreground">
                    {formatCurrency(ec.normalCost)}
                  </td>
                  <td className={cn('py-2 px-2 text-right', ec.overtimeHours > 0 ? 'text-orange-400' : 'text-muted-foreground')}>
                    {ec.overtimeHours}h
                  </td>
                  <td className={cn('py-2 px-2 text-right', ec.overtimeCost > 0 ? 'text-red-400' : 'text-muted-foreground')}>
                    {formatCurrency(ec.overtimeCost)}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-foreground">
                    {formatCurrency(ec.totalCost)}
                  </td>
                </tr>
              ))}
              {employeeCosts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum dado de custo para esta semana
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 4: ROI per Employee */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-purple-400" />
          <h2 className="text-lg font-semibold text-foreground">ROI por Colaborador</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">Nome</th>
                <th className="text-right py-2 px-2 font-medium">Pedidos</th>
                <th className="text-right py-2 px-2 font-medium">Custo Total</th>
                <th className="text-right py-2 px-2 font-medium">Pedidos/R$</th>
                <th className="text-center py-2 px-2 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {roiData.map((r) => {
                const isProductive = r.roi >= 0.5 // 0.5 orders per R$ = threshold
                return (
                  <tr
                    key={r.employee.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-2 px-2 font-medium text-foreground">
                      {r.employee.nickname || r.employee.name}
                    </td>
                    <td className="py-2 px-2 text-right text-foreground">
                      {r.totalOrders}
                    </td>
                    <td className="py-2 px-2 text-right text-foreground">
                      {formatCurrency(r.totalCost)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-foreground">
                      {r.roi.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={cn(
                          'inline-block px-3 py-1 rounded-full text-xs font-bold',
                          isProductive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400',
                        )}
                      >
                        {isProductive ? 'Produtivo' : 'Custoso'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {roiData.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhum dado de produtividade para esta semana
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 5: Payroll Projection */}
      <Card variant="glass">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={20} className="text-yellow-400" />
          <h2 className="text-lg font-semibold text-foreground">Projecao Mensal</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-3">
          Baseado no padrao da semana atual, projecao de custo mensal estimado:
        </p>
        <p className="text-4xl font-bold text-foreground">{formatCurrency(monthlyProjection)}</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Folha/mes</p>
            <p className="text-sm font-bold text-foreground">{formatCurrency(summary.totalFolha * 4.33)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">HE/mes</p>
            <p className={cn('text-sm font-bold', summary.totalHE > 0 ? 'text-red-400' : 'text-green-400')}>
              {formatCurrency(summary.totalHE * 4.33)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Erros/mes</p>
            <p className={cn('text-sm font-bold', summary.totalErros > 0 ? 'text-red-400' : 'text-green-400')}>
              {formatCurrency(summary.totalErros * 4.33)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pedidos estimados</p>
            <p className="text-sm font-bold text-foreground">{Math.round(summary.totalOrders * 4.33)}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
