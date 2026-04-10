import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Clock,
  Fingerprint,
  AlertTriangle,
  CheckCircle,
  Users,
  Zap,
  Target,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useApp } from '@/store/AppContext'
import { cn, formatCurrency, greetingBR } from '@/lib/utils'
import { calculateOEE, calculateCostPerOrder } from '@/services/opsMetrics'
import { api } from '@/lib/api'
import { useEffect } from 'react'

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.getFullYear(), now.getMonth(), diff)
  return monday.toISOString().split('T')[0]
}

export default function HomePage() {
  const { state } = useApp()
  const { currentUser } = state
  const today = getToday()
  const weekStart = getWeekStart()

  const loggedEmployeeId = currentUser.employeeId || ''

  // Load unit config (targetOrdersPerHour) para OEE
  const [targetOrdersPerHour, setTargetOrdersPerHour] = useState(8)
  useEffect(() => {
    api.get<{ targetOrdersPerHour?: number }>('/api/data/unit-config')
      .then(data => { if (data?.targetOrdersPerHour) setTargetOrdersPerHour(data.targetOrdersPerHour) })
      .catch(() => {})
  }, [])

  // Turnover Risk — só gerente/admin
  type TurnoverRisk = { employeeId: string; employeeName: string; absences: number; lates: number; warnings: number; riskLevel: 'medium' | 'high' | 'critical'; riskScore: number }
  const [turnoverRisks, setTurnoverRisks] = useState<TurnoverRisk[]>([])
  useEffect(() => {
    if (currentUser.role !== 'gerente' && currentUser.role !== 'admin') return
    api.get<TurnoverRisk[]>('/api/turnover-risk')
      .then(data => setTurnoverRisks(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [currentUser.role])

  // Today's schedule
  const todaySchedule = useMemo(() => {
    for (const schedule of state.schedules) {
      for (const day of schedule.days) {
        if (day.date === today) return day
      }
    }
    return null
  }, [state.schedules, today])

  // Colaborador metrics
  const myShiftToday = useMemo(() => {
    if (!todaySchedule || !loggedEmployeeId) return null
    const assignedSlots = todaySchedule.slots
      .filter((s) => s.assignments.some((a) => a.employeeId === loggedEmployeeId))
    if (assignedSlots.length === 0) return null
    const start = assignedSlots[0].hour.split('-')[0]
    const end = assignedSlots[assignedSlots.length - 1].hour.split('-')[1]
    return { start, end, hours: assignedSlots.length }
  }, [todaySchedule, loggedEmployeeId])

  const myPontoToday = useMemo(() => {
    return state.pontoRecords.find((p) => p.employeeId === loggedEmployeeId && p.date === today) ?? null
  }, [state.pontoRecords, loggedEmployeeId, today])

  const myWeekProd = useMemo(() => {
    return state.productivityRecords.filter((r) => r.employeeId === loggedEmployeeId && r.weekStart === weekStart)
  }, [state.productivityRecords, loggedEmployeeId, weekStart])

  // Lider/Gerente metrics
  const todayStats = useMemo(() => {
    if (!todaySchedule) return { scheduled: 0, checkedIn: 0, absent: 0, late: 0 }
    const scheduled = new Set<string>()
    todaySchedule.slots.forEach((s) => s.assignments.forEach((a) => scheduled.add(a.employeeId)))
    const checkedIn = state.pontoRecords.filter((p) => p.date === today && (p.status === 'on_time' || p.status === 'late')).length
    const absent = state.pontoRecords.filter((p) => p.date === today && p.status === 'absent').length
    const late = state.pontoRecords.filter((p) => p.date === today && p.status === 'late').length
    return { scheduled: scheduled.size, checkedIn, absent, late }
  }, [todaySchedule, state.pontoRecords, today])

  const weekProd = useMemo(() => {
    const records = state.productivityRecords.filter((r) => r.weekStart === weekStart)
    if (records.length === 0) return null
    return {
      totalOrders: records.reduce((s, r) => s + r.totalOrders, 0),
      totalErrors: records.reduce((s, r) => s + r.totalErrors, 0),
      totalErrorCost: records.reduce((s, r) => s + r.errorCost, 0),
      avgSla: records.reduce((s, r) => s + r.slaCompliance, 0) / records.length,
    }
  }, [state.productivityRecords, weekStart])

  // ── KPIs norte: OEE + Cost per Order ──────────────────────────────
  // Proposta do especialista Tiago (party mode). OEE = única nota que
  // o gerente olha de manhã e sabe se tá ganhando ou perdendo a semana.
  const currentSchedule = useMemo(
    () => state.schedules.find(s => s.weekStart === weekStart),
    [state.schedules, weekStart],
  )

  const oeeResult = useMemo(
    () => calculateOEE({
      schedule: currentSchedule,
      pontoRecords: state.pontoRecords,
      productivityRecords: state.productivityRecords,
      targetOrdersPerHour,
    }),
    [currentSchedule, state.pontoRecords, state.productivityRecords, targetOrdersPerHour],
  )

  const costResult = useMemo(
    () => calculateCostPerOrder({
      schedule: currentSchedule,
      pontoRecords: state.pontoRecords,
      productivityRecords: state.productivityRecords,
      employees: state.employees,
    }),
    [currentSchedule, state.pontoRecords, state.productivityRecords, state.employees],
  )

  const hasOpsData = (oeeResult.scheduledHours > 0 || oeeResult.totalOrders > 0)

  // ── OEE da semana anterior (comparativo) ────────────────────────
  const prevWeekStart = useMemo(() => {
    const d = new Date(weekStart + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().split('T')[0]
  }, [weekStart])

  const prevSchedule = useMemo(
    () => state.schedules.find(s => s.weekStart === prevWeekStart),
    [state.schedules, prevWeekStart],
  )

  const prevOEE = useMemo(
    () => calculateOEE({
      schedule: prevSchedule,
      pontoRecords: state.pontoRecords,
      productivityRecords: state.productivityRecords,
      targetOrdersPerHour,
    }),
    [prevSchedule, state.pontoRecords, state.productivityRecords, targetOrdersPerHour],
  )

  const oeeDelta = hasOpsData && prevOEE.scheduledHours > 0
    ? Math.round(oeeResult.oee * 100) - Math.round(prevOEE.oee * 100)
    : null

  // ── OEE Drill-down por colaborador ──────────────────────────────
  const [showOEEDrilldown, setShowOEEDrilldown] = useState(false)

  const oeeByEmployee = useMemo(() => {
    if (!currentSchedule) return []
    const empMap = new Map(state.employees.map(e => [e.id, e]))
    const weekDates = currentSchedule.days?.map(d => d.date) ?? []

    // Collect unique employee IDs from schedule
    const empIds = new Set<string>()
    for (const day of currentSchedule.days || []) {
      for (const slot of day.slots || []) {
        for (const a of slot.assignments || []) empIds.add(a.employeeId)
      }
    }

    return [...empIds].map(empId => {
      const emp = empMap.get(empId)
      if (!emp) return null

      // Hours scheduled for this employee
      let scheduledHours = 0
      for (const day of currentSchedule.days || []) {
        for (const slot of day.slots || []) {
          if (slot.assignments?.some(a => a.employeeId === empId)) scheduledHours++
        }
      }

      // Hours worked
      const ponto = state.pontoRecords.filter(p => p.employeeId === empId && weekDates.includes(p.date))
      const workedMinutes = ponto.reduce((s, p) => s + (p.workedMinutes || 0), 0)
      const workedHours = workedMinutes / 60

      // Productivity
      const prod = state.productivityRecords.filter(r => r.employeeId === empId && r.weekStart === weekStart)
      const orders = prod.reduce((s, r) => s + (r.totalOrders || 0), 0)
      const errors = prod.reduce((s, r) => s + (r.totalErrors || 0), 0)

      const avail = scheduledHours > 0 ? Math.min(1, workedHours / scheduledHours) : 0
      const perf = scheduledHours > 0 ? Math.min(1, orders / (scheduledHours * 8)) : 0
      const qual = orders > 0 ? (orders - errors) / orders : 1
      const oee = avail * perf * qual

      return {
        id: empId,
        name: emp.nickname || emp.name,
        scheduledHours,
        workedHours: Math.round(workedHours * 10) / 10,
        orders,
        errors,
        oee: Math.round(oee * 100),
        avail: Math.round(avail * 100),
        perf: Math.round(perf * 100),
        qual: Math.round(qual * 100),
        costDay: scheduledHours * (emp.hourlyRate || 0),
      }
    }).filter(Boolean).sort((a, b) => (b?.oee || 0) - (a?.oee || 0)) as Array<{
      id: string; name: string; scheduledHours: number; workedHours: number;
      orders: number; errors: number; oee: number; avail: number; perf: number; qual: number; costDay: number
    }>
  }, [currentSchedule, state.employees, state.pontoRecords, state.productivityRecords, weekStart])

  // ── Chart data ───────────────────────────────────────────────────────────

    const DAY_SHORT: Record<string, string> = {
    segunda: 'Seg', terca: 'Ter', quarta: 'Qua',
    quinta: 'Qui', sexta: 'Sex', sabado: 'Sab', domingo: 'Dom',
  }

  // Weekly attendance chart data
  const weeklyAttendanceData = useMemo(() => {
    const currentSchedule = state.schedules.find((s) => s.weekStart === weekStart)
    if (!currentSchedule) return []
    return currentSchedule.days.map((day) => {
      const scheduled = new Set<string>()
      day.slots.forEach((sl) => sl.assignments.forEach((a) => scheduled.add(a.employeeId)))
      const total = scheduled.size
      const checkedIn = state.pontoRecords.filter(
        (p) => p.date === day.date && (p.status === 'on_time' || p.status === 'late'),
      ).length
      const presence = total > 0 ? Math.round((checkedIn / total) * 100) : 0
      return { day: DAY_SHORT[day.dayOfWeek] ?? day.dayOfWeek, presence, total }
    })
  }, [state.schedules, state.pontoRecords, weekStart])

  // Daily cost chart data
  const dailyCostData = useMemo(() => {
    const currentSchedule = state.schedules.find((s) => s.weekStart === weekStart)
    if (!currentSchedule) return []
    return currentSchedule.days.map((day) => {
      let cost = 0
      day.slots.forEach((sl) => {
        sl.assignments.forEach((a) => {
          const emp = state.employees.find((e) => e.id === a.employeeId)
          if (emp) cost += emp.hourlyRate
        })
      })
      return { day: DAY_SHORT[day.dayOfWeek] ?? day.dayOfWeek, custo: Math.round(cost) }
    })
  }, [state.schedules, state.employees, weekStart])

  // Productivity trend — last 4 productivity records (all employees)
  const productivityTrendData = useMemo(() => {
    const sorted = [...state.productivityRecords]
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .slice(-4)
    return sorted.map((r, i) => ({
      idx: `S${i + 1}`,
      pedidos: r.totalOrders,
    }))
  }, [state.productivityRecords])

  const greeting = greetingBR()

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {greeting}, {currentUser.name || 'Usuario'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
      </div>

      {/* ── COLABORADOR ── */}
      {currentUser.role === 'colaborador' && (
        <>
          {myShiftToday ? (
            <Card className={cn('border-2', myPontoToday?.checkIn ? 'border-success/30 bg-success/5' : 'border-primary/30 bg-primary/5')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Seu turno hoje</p>
                  <p className="text-2xl font-black text-foreground">{myShiftToday.start} — {myShiftToday.end}</p>
                  <p className="text-sm text-muted-foreground">{myShiftToday.hours}h de trabalho</p>
                </div>
                {myPontoToday?.checkIn ? (
                  <Badge variant="success" size="md"><CheckCircle className="mr-1 h-3.5 w-3.5" /> Check-in feito</Badge>
                ) : (
                  <Link to="/checkin" className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
                    <Fingerprint className="h-5 w-5" /> Check-in
                  </Link>
                )}
              </div>
            </Card>
          ) : (
            <Card variant="glass" className="text-center py-6">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 font-medium text-foreground">Folga hoje</p>
              <p className="text-sm text-muted-foreground">Voce nao tem turno escalado</p>
            </Card>
          )}

          {myWeekProd.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="text-center !p-3">
                  <p className="text-[10px] text-muted-foreground">Pedidos</p>
                  <p className="text-xl font-bold text-foreground">{myWeekProd.reduce((s, r) => s + r.totalOrders, 0)}</p>
                </Card>
                <Card className="text-center !p-3">
                  <p className="text-[10px] text-muted-foreground">Erros</p>
                  <p className={cn('text-xl font-bold', myWeekProd.reduce((s, r) => s + r.totalErrors, 0) === 0 ? 'text-success' : 'text-destructive')}>
                    {myWeekProd.reduce((s, r) => s + r.totalErrors, 0)}
                  </p>
                </Card>
                <Card className="text-center !p-3">
                  <p className="text-[10px] text-muted-foreground">SLA</p>
                  <p className="text-xl font-bold text-foreground">
                    {(myWeekProd.reduce((s, r) => s + r.slaCompliance, 0) / myWeekProd.length).toFixed(0)}%
                  </p>
                </Card>
              </div>
              {productivityTrendData.length > 0 && (
                <Card>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tendencia de Pedidos</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={productivityTrendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                      <XAxis dataKey="idx" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        formatter={(value) => [Number(value), 'Pedidos']}
                      />
                      <Line type="monotone" dataKey="pedidos" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ── SUPERVISOR ── */}
      {currentUser.role === 'supervisor' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="text-center !p-3">
              <Users className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-1 text-2xl font-bold text-foreground">{todayStats.scheduled}</p>
              <p className="text-[10px] text-muted-foreground">Escalados hoje</p>
            </Card>
            <Card className="text-center !p-3">
              <CheckCircle className="mx-auto h-5 w-5 text-success" />
              <p className="mt-1 text-2xl font-bold text-success">{todayStats.checkedIn}</p>
              <p className="text-[10px] text-muted-foreground">Check-in feito</p>
            </Card>
            <Card className="text-center !p-3">
              <Clock className="mx-auto h-5 w-5 text-warning" />
              <p className="mt-1 text-2xl font-bold text-warning">{todayStats.late}</p>
              <p className="text-[10px] text-muted-foreground">Atrasados</p>
            </Card>
            <Card className="text-center !p-3">
              <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
              <p className="mt-1 text-2xl font-bold text-destructive">{todayStats.absent}</p>
              <p className="text-[10px] text-muted-foreground">Faltas</p>
            </Card>
          </div>

          {weekProd && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produtividade da Semana</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{weekProd.totalOrders}</p>
                  <p className="text-[10px] text-muted-foreground">Pedidos</p>
                </div>
                <div className="text-center">
                  <p className={cn('text-2xl font-bold', weekProd.totalErrors === 0 ? 'text-success' : 'text-destructive')}>{weekProd.totalErrors}</p>
                  <p className="text-[10px] text-muted-foreground">Erros</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(weekProd.totalErrorCost)}</p>
                  <p className="text-[10px] text-muted-foreground">Reembolso</p>
                </div>
                <div className="text-center">
                  <p className={cn('text-2xl font-bold', weekProd.avgSla >= 95 ? 'text-success' : 'text-warning')}>{weekProd.avgSla.toFixed(0)}%</p>
                  <p className="text-[10px] text-muted-foreground">SLA</p>
                </div>
              </div>
            </Card>
          )}

          {weeklyAttendanceData.length > 0 && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Presenca Semanal (%)</h3>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={weeklyAttendanceData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => [String(Number(value)) + '%', 'Presenca']}
                  />
                  <Bar dataKey="presence" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {productivityTrendData.length > 0 && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tendencia de Pedidos (ultimas semanas)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={productivityTrendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                  <XAxis dataKey="idx" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => [Number(value), 'Pedidos']}
                  />
                  <Line type="monotone" dataKey="pedidos" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}

      {/* ── GERENTE / ADMIN ── */}
      {(currentUser.role === 'gerente' || currentUser.role === 'admin') && (
        <>
          {/* ═══ Alerta de Risco de Saída ═══════════════════════════ */}
          {turnoverRisks.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-semibold text-destructive">
                  {turnoverRisks.length} {turnoverRisks.length === 1 ? 'colaborador em risco' : 'colaboradores em risco'} de saída
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {turnoverRisks.map((r) => (
                  <div key={r.employeeId} className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs',
                    r.riskLevel === 'critical' ? 'bg-destructive/20 text-destructive' :
                    r.riskLevel === 'high' ? 'bg-warning/20 text-warning' :
                    'bg-muted text-muted-foreground',
                  )}>
                    <span className="font-semibold">{r.employeeName}</span>
                    <span className="opacity-70">
                      {r.absences > 0 && `${r.absences}F `}
                      {r.lates > 0 && `${r.lates}A `}
                      {r.warnings > 0 && `${r.warnings}Adv`}
                    </span>
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase',
                      r.riskLevel === 'critical' ? 'bg-destructive text-white' :
                      r.riskLevel === 'high' ? 'bg-warning text-white' :
                      'bg-muted-foreground/30 text-foreground',
                    )}>
                      {r.riskLevel === 'critical' ? 'Crítico' : r.riskLevel === 'high' ? 'Alto' : 'Médio'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ KPIs Norte: OEE + Cost per Order ═════════════════════ */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* OEE Card */}
            <Card className={cn(
              'border-2',
              oeeResult.classification === 'classe mundial' && 'border-success/50 bg-success/5',
              oeeResult.classification === 'saudável' && 'border-success/30 bg-success/5',
              oeeResult.classification === 'médio' && 'border-warning/40 bg-warning/5',
              oeeResult.classification === 'crítico' && 'border-destructive/40 bg-destructive/5',
            )}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OEE da Semana</p>
                  <p className={cn(
                    'mt-1 text-5xl font-black',
                    oeeResult.classification === 'classe mundial' && 'text-success',
                    oeeResult.classification === 'saudável' && 'text-success',
                    oeeResult.classification === 'médio' && 'text-warning',
                    oeeResult.classification === 'crítico' && 'text-destructive',
                  )}>
                    {hasOpsData ? `${Math.round(oeeResult.oee * 100)}%` : '—'}
                  </p>
                  {hasOpsData ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {oeeResult.classification}
                      </span>
                      {oeeDelta !== null && (
                        <span className={cn(
                          'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                          oeeDelta > 0 ? 'bg-success/15 text-success' :
                          oeeDelta < 0 ? 'bg-destructive/15 text-destructive' :
                          'bg-muted text-muted-foreground',
                        )}>
                          {oeeDelta > 0 ? '↑' : oeeDelta < 0 ? '↓' : '='}{Math.abs(oeeDelta)}pp vs anterior
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Sem dados esta semana</p>
                  )}
                </div>
                <Target className={cn(
                  'h-7 w-7',
                  oeeResult.classification === 'classe mundial' && 'text-success',
                  oeeResult.classification === 'saudável' && 'text-success',
                  oeeResult.classification === 'médio' && 'text-warning',
                  oeeResult.classification === 'crítico' && 'text-destructive',
                )} />
              </div>
              {hasOpsData && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Avail.</p>
                    <p className="text-sm font-bold text-foreground">{Math.round(oeeResult.availability * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Perf.</p>
                    <p className="text-sm font-bold text-foreground">{Math.round(oeeResult.performance * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Qual.</p>
                    <p className="text-sm font-bold text-foreground">{Math.round(oeeResult.quality * 100)}%</p>
                  </div>
                </div>
              )}
              {hasOpsData && oeeByEmployee.length > 0 && (
                <button
                  onClick={() => setShowOEEDrilldown(v => !v)}
                  className="mt-3 flex w-full items-center justify-center gap-1 border-t border-border pt-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showOEEDrilldown ? 'Ocultar detalhes' : 'Ver por colaborador'}
                  {showOEEDrilldown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}
            </Card>

            {/* Cost per Order Card */}
            <Card className="border-2 border-primary/30 bg-primary/5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custo por Pedido</p>
                  <p className="mt-1 text-5xl font-black text-primary">
                    {costResult.totalOrders > 0 ? formatCurrency(costResult.costPerOrder) : '—'}
                  </p>
                  {costResult.totalOrders > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {costResult.totalOrders} pedidos · {formatCurrency(costResult.totalCost)} custo total
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Aguardando produtividade lançada</p>
                  )}
                </div>
                <DollarSign className="h-7 w-7 text-primary" />
              </div>
              {costResult.totalOrders > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Folha</p>
                    <p className="text-xs font-bold text-foreground">{formatCurrency(costResult.breakdown.folhaHoras)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Erros</p>
                    <p className="text-xs font-bold text-destructive">{formatCurrency(costResult.breakdown.erros)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">HE</p>
                    <p className="text-xs font-bold text-warning">{formatCurrency(costResult.breakdown.horasExtras)}</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ═══ OEE Drill-down por colaborador ═══ */}
          {showOEEDrilldown && oeeByEmployee.length > 0 && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                OEE por Colaborador — Semana {weekStart}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 px-2 text-left font-medium">Nome</th>
                      <th className="py-2 px-2 text-center font-medium">OEE</th>
                      <th className="py-2 px-2 text-center font-medium">Avail.</th>
                      <th className="py-2 px-2 text-center font-medium">Perf.</th>
                      <th className="py-2 px-2 text-center font-medium">Qual.</th>
                      <th className="py-2 px-2 text-center font-medium">Horas</th>
                      <th className="py-2 px-2 text-center font-medium">Pedidos</th>
                      <th className="py-2 px-2 text-center font-medium">Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oeeByEmployee.map(emp => (
                      <tr key={emp.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="py-2 px-2 font-medium text-foreground">{emp.name}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={cn(
                            'inline-block rounded-md px-2 py-0.5 text-xs font-bold',
                            emp.oee >= 85 ? 'bg-success/15 text-success' :
                            emp.oee >= 60 ? 'bg-warning/15 text-warning' :
                            'bg-destructive/15 text-destructive',
                          )}>
                            {emp.oee}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{emp.avail}%</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{emp.perf}%</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{emp.qual}%</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">{emp.workedHours}/{emp.scheduledHours}h</td>
                        <td className="py-2 px-2 text-center text-foreground font-medium">{emp.orders}</td>
                        <td className={cn('py-2 px-2 text-center font-medium', emp.errors > 0 ? 'text-destructive' : 'text-success')}>{emp.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="text-center !p-3">
              <Users className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-1 text-2xl font-bold text-foreground">{state.employees.filter((e) => e.status === 'ativo').length}</p>
              <p className="text-[10px] text-muted-foreground">Ativos</p>
            </Card>
            <Card className="text-center !p-3">
              <CalendarDays className="mx-auto h-5 w-5 text-accent" />
              <p className="mt-1 text-2xl font-bold text-foreground">{state.schedules.filter((s) => s.published).length}</p>
              <p className="text-[10px] text-muted-foreground">Escalas pub.</p>
            </Card>
            {weekProd ? (
              <>
                <Card className="text-center !p-3">
                  <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
                  <p className="mt-1 text-2xl font-bold text-destructive">{formatCurrency(weekProd.totalErrorCost)}</p>
                  <p className="text-[10px] text-muted-foreground">Reembolso semana</p>
                </Card>
                <Card className="text-center !p-3">
                  <Target className="mx-auto h-5 w-5 text-success" />
                  <p className="mt-1 text-2xl font-bold text-foreground">{weekProd.avgSla.toFixed(0)}%</p>
                  <p className="text-[10px] text-muted-foreground">SLA semana</p>
                </Card>
              </>
            ) : (
              <>
                <Card className="text-center !p-3">
                  <Zap className="mx-auto h-5 w-5 text-muted-foreground/40" />
                  <p className="mt-1 text-lg font-bold text-muted-foreground">-</p>
                  <p className="text-[10px] text-muted-foreground">Reembolso</p>
                </Card>
                <Card className="text-center !p-3">
                  <Target className="mx-auto h-5 w-5 text-muted-foreground/40" />
                  <p className="mt-1 text-lg font-bold text-muted-foreground">-</p>
                  <p className="text-[10px] text-muted-foreground">SLA</p>
                </Card>
              </>
            )}
          </div>

          {todayStats.scheduled > 0 && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hoje na Operacao</h3>
              <div className="flex gap-6">
                <div><span className="text-lg font-bold text-foreground">{todayStats.checkedIn}</span><span className="text-xs text-muted-foreground">/{todayStats.scheduled} check-in</span></div>
                {todayStats.late > 0 && <div><span className="text-lg font-bold text-warning">{todayStats.late}</span><span className="text-xs text-muted-foreground"> atrasados</span></div>}
                {todayStats.absent > 0 && <div><span className="text-lg font-bold text-destructive">{todayStats.absent}</span><span className="text-xs text-muted-foreground"> faltas</span></div>}
              </div>
            </Card>
          )}

          {/* ── Charts ── */}
          <Card>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Presenca Semanal (%)</h3>
            {weeklyAttendanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={weeklyAttendanceData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => [String(Number(value)) + '%', 'Presenca']}
                  />
                  <Bar dataKey="presence" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[190px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <CalendarDays className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sem escala publicada para esta semana</p>
                <Link to="/escala" className="text-xs font-medium text-primary hover:underline">Ir para Escala →</Link>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custo Operacional por Dia (R$)</h3>
            {dailyCostData.length > 0 ? (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={dailyCostData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => [formatCurrency(Number(value)), 'Custo']}
                  />
                  <Area type="monotone" dataKey="custo" stroke="#22c55e" strokeWidth={2} fill="url(#costGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[190px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <DollarSign className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sem dados de custo para esta semana</p>
                <p className="text-xs">Publique uma escala para ver os custos aparecerem aqui.</p>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tendencia de Pedidos (ultimas semanas)</h3>
            {productivityTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={productivityTrendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                  <XAxis dataKey="idx" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => [Number(value), 'Pedidos']}
                  />
                  <Line type="monotone" dataKey="pedidos" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Zap className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sem histórico de produtividade</p>
                <Link to="/produtividade" className="text-xs font-medium text-primary hover:underline">Lançar dados →</Link>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── RH ── */}
      {currentUser.role === 'rh' && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <Users className="mx-auto h-6 w-6 text-primary" />
            <div className="mt-1 text-2xl font-bold text-foreground">{state.employees.filter(e => e.status === 'ativo').length}</div>
            <div className="text-[11px] text-muted-foreground">Ativos</div>
          </Card>
          <Card className="text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-warning" />
            <div className="mt-1 text-2xl font-bold text-warning">{state.employees.filter(e => e.status === 'ferias').length}</div>
            <div className="text-[11px] text-muted-foreground">Ferias</div>
          </Card>
        </div>
      )}
    </div>
  )
}
