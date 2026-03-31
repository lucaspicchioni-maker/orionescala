import { useMemo } from 'react'
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
import { cn, formatCurrency } from '@/lib/utils'

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

  const loggedEmployeeId = localStorage.getItem('orion_logged_employee') || ''

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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

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

          {dailyCostData.length > 0 && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custo Operacional por Dia (R$)</h3>
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
