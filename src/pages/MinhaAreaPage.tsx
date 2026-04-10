import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Award,
  Bell,
  Fingerprint,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useApp } from '@/store/AppContext'
import { cn, formatCurrency } from '@/lib/utils'

const DAY_LABELS: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda', 2: 'Terca', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sabado',
}
const DAY_SHORT: Record<number, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sab',
}

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

export default function MinhaAreaPage() {
  const { state, dispatch } = useApp()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [weekOffset, setWeekOffset] = useState(0)
  const isColaborador = state.currentUser.role === 'colaborador'

  useEffect(() => {
    const empId = state.currentUser.employeeId
    if (empId && isColaborador) setSelectedEmployeeId(empId)
  }, [isColaborador, state.currentUser.employeeId])

  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset])
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  const activeEmployees = useMemo(
    () => state.employees.filter((e) => e.status === 'ativo' && e.role !== 'gerente'),
    [state.employees],
  )

  const employee = useMemo(
    () => state.employees.find((e) => e.id === selectedEmployeeId),
    [state.employees, selectedEmployeeId],
  )

  // Get employee's schedule for the week
  const weekSchedule = useMemo(() => {
    if (!selectedEmployeeId) return []

    const schedule = state.schedules.find((s) => s.weekStart === weekStart)
    if (!schedule) return []

    return schedule.days.map((day) => {
      const d = new Date(day.date + 'T00:00:00')
      const assignedSlots = day.slots
        .map((slot, idx) => ({
          slot,
          idx,
          assignment: slot.assignments.find((a) => a.employeeId === selectedEmployeeId),
        }))
        .filter((s) => s.assignment)

      if (assignedSlots.length === 0) return { date: day.date, dayLabel: DAY_LABELS[d.getDay()], shifts: [], hours: 0, status: 'folga' as const }

      const startHour = assignedSlots[0].slot.hour.split('-')[0]
      const lastSlot = assignedSlots[assignedSlots.length - 1]
      const endHour = lastSlot.slot.hour.split('-')[1]
      const status = assignedSlots[0].assignment!.status

      return {
        date: day.date,
        dayLabel: DAY_LABELS[d.getDay()],
        shifts: [{ start: startHour, end: endHour }],
        hours: assignedSlots.length,
        status,
      }
    })
  }, [selectedEmployeeId, state.schedules, weekStart])

  // Earnings for the week
  const weekEarnings = useMemo(() => {
    if (!employee) return { scheduled: 0, worked: 0, earnings: 0, pontoHours: 0 }

    const scheduledHours = weekSchedule.reduce((s, d) => s + d.hours, 0)

    // Use ponto records for actual worked hours
    const pontoRecords = state.pontoRecords.filter(
      (p) => p.employeeId === selectedEmployeeId && weekDates.includes(p.date),
    )
    const pontoMinutes = pontoRecords.reduce((s, r) => s + r.workedMinutes, 0)
    const pontoHours = pontoMinutes / 60

    // Use actual hours if ponto data exists, otherwise use scheduled
    const workedHours = pontoHours > 0 ? pontoHours : scheduledHours
    const earnings = workedHours * employee.hourlyRate

    return { scheduled: scheduledHours, worked: workedHours, earnings, pontoHours }
  }, [employee, weekSchedule, state.pontoRecords, selectedEmployeeId, weekDates])

  // Monthly earnings (last 4 weeks)
  const monthEarnings = useMemo(() => {
    if (!employee) return { total: 0, hours: 0, weeks: 0 }

    let totalHours = 0
    let weeks = 0

    for (let i = 0; i < 4; i++) {
      const ws = getWeekStart(-i)
      const dates = getWeekDates(ws)
      const schedule = state.schedules.find((s) => s.weekStart === ws)

      if (schedule) {
        let weekHours = 0
        // Prefer ponto data
        const pontoRecords = state.pontoRecords.filter(
          (p) => p.employeeId === selectedEmployeeId && dates.includes(p.date),
        )
        if (pontoRecords.length > 0) {
          weekHours = pontoRecords.reduce((s, r) => s + r.workedMinutes, 0) / 60
        } else {
          // Fall back to scheduled
          for (const day of schedule.days) {
            for (const slot of day.slots) {
              if (slot.assignments.some((a) => a.employeeId === selectedEmployeeId)) {
                weekHours++
              }
            }
          }
        }
        totalHours += weekHours
        if (weekHours > 0) weeks++
      }
    }

    return { total: totalHours * employee.hourlyRate, hours: totalHours, weeks }
  }, [employee, state.schedules, state.pontoRecords, selectedEmployeeId])

  // KPIs
  const myKPIs = useMemo(() => {
    if (!selectedEmployeeId) return null

    const records = state.pontoRecords.filter((p) => p.employeeId === selectedEmployeeId)
    if (records.length === 0) return null

    const present = records.filter((r) => r.status === 'on_time' || r.status === 'late')
    const onTime = records.filter((r) => r.status === 'on_time')
    const absent = records.filter((r) => r.status === 'absent')

    let scheduledDays = 0
    for (const schedule of state.schedules) {
      for (const day of schedule.days) {
        if (day.slots.some((s) => s.assignments.some((a) => a.employeeId === selectedEmployeeId))) {
          scheduledDays++
        }
      }
    }

    const assiduidade = scheduledDays > 0 ? (present.length / scheduledDays) * 100 : 0
    const pontualidade = present.length > 0 ? (onTime.length / present.length) * 100 : 0
    const totalLate = records.reduce((s, r) => s + r.lateMinutes, 0)

    return { assiduidade, pontualidade, totalLate, present: present.length, absent: absent.length, scheduledDays }
  }, [selectedEmployeeId, state.pontoRecords, state.schedules])

  // Pending notifications
  const myNotifications = useMemo(() => {
    return state.notifications
      .filter((n) => n.employeeId === selectedEmployeeId && n.status === 'pending')
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
  }, [state.notifications, selectedEmployeeId])

  // Confirm/decline assignment
  const handleConfirm = (date: string) => {
    const schedule = state.schedules.find((s) => s.weekStart === weekStart)
    if (!schedule) return

    for (const day of schedule.days) {
      if (day.date !== date) continue
      for (const slot of day.slots) {
        const assignment = slot.assignments.find((a) => a.employeeId === selectedEmployeeId)
        if (assignment) {
          dispatch({
            type: 'UPDATE_ASSIGNMENT_STATUS',
            payload: {
              weekStart,
              date,
              hour: slot.hour,
              assignmentId: assignment.id,
              status: 'confirmed',
            },
          })
        }
      }
    }
  }

  const handleDecline = (date: string) => {
    const schedule = state.schedules.find((s) => s.weekStart === weekStart)
    if (!schedule) return

    for (const day of schedule.days) {
      if (day.date !== date) continue
      for (const slot of day.slots) {
        const assignment = slot.assignments.find((a) => a.employeeId === selectedEmployeeId)
        if (assignment) {
          dispatch({
            type: 'UPDATE_ASSIGNMENT_STATUS',
            payload: {
              weekStart,
              date,
              hour: slot.hour,
              assignmentId: assignment.id,
              status: 'declined',
            },
          })
        }
      }
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-lg space-y-5 p-4">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-gradient text-2xl font-bold">Minha Area</h1>
        <p className="text-sm text-muted-foreground">Escala, ganhos e desempenho</p>
      </div>

      {/* Employee selector — oculto para colaborador logado */}
      {!isColaborador && (
        <select
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-medium text-foreground"
        >
          <option value="">Selecione seu nome...</option>
          {activeEmployees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nickname || emp.name}
            </option>
          ))}
        </select>
      )}

      {employee && (
        <>
          {/* Welcome + Quick Check-in */}
          {(() => {
            // Verifica se tem turno hoje e se já fez check-in
            const todayScheduleDay = weekSchedule.find(d => d.date === new Date().toISOString().split('T')[0])
            const hasTurnToday = todayScheduleDay && todayScheduleDay.status !== 'folga'
            const todayPonto = state.pontoRecords.find(
              p => p.employeeId === selectedEmployeeId && p.date === new Date().toISOString().split('T')[0]
            )
            const hasCheckedIn = !!todayPonto?.checkIn

            return (
              <div className={cn(
                'rounded-xl p-4',
                hasTurnToday && !hasCheckedIn
                  ? 'bg-gradient-to-r from-primary/15 to-accent/15 border-2 border-primary/30'
                  : 'bg-gradient-to-r from-primary/10 to-accent/10',
              )}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-foreground">
                      Ola, {employee.nickname || employee.name}!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(employee.hourlyRate)}/hora
                    </p>
                    {hasTurnToday && todayScheduleDay.shifts[0] && (
                      <p className="mt-1 text-sm font-semibold text-primary">
                        Turno hoje: {todayScheduleDay.shifts[0].start} — {todayScheduleDay.shifts[0].end} ({todayScheduleDay.hours}h)
                      </p>
                    )}
                  </div>
                  {hasTurnToday && (
                    hasCheckedIn ? (
                      <div className="flex flex-col items-center gap-1">
                        <CheckCircle className="h-8 w-8 text-success" />
                        <span className="text-[10px] font-semibold text-success">Check-in OK</span>
                      </div>
                    ) : (
                      <Link
                        to="/checkin"
                        className="flex flex-col items-center gap-1 rounded-xl bg-primary px-5 py-3 text-primary-foreground transition-transform active:scale-95"
                      >
                        <Fingerprint className="h-7 w-7" />
                        <span className="text-xs font-bold">Check-in</span>
                      </Link>
                    )
                  )}
                </div>
              </div>
            )
          })()}

          {/* Notifications */}
          {myNotifications.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-5 w-5 text-warning" />
                <span className="text-sm font-semibold text-foreground">
                  {myNotifications.length} notificacao(es) pendente(s)
                </span>
              </div>
              <div className="space-y-2">
                {myNotifications.slice(0, 3).map((notif) => (
                  <div key={notif.id} className="rounded-lg bg-card p-3 text-sm">
                    <p className="text-foreground">{notif.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(notif.scheduledFor).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Earnings summary */}
          <div className="grid grid-cols-2 gap-3">
            <Card variant="glass" className="text-center">
              <DollarSign className="mx-auto h-6 w-6 text-primary" />
              <p className="mt-2 text-2xl font-bold text-foreground">
                {formatCurrency(weekEarnings.earnings)}
              </p>
              <p className="text-xs text-muted-foreground">Esta semana</p>
              <p className="text-[10px] text-muted-foreground">
                {weekEarnings.pontoHours > 0
                  ? `${weekEarnings.worked.toFixed(1)}h reais`
                  : `${weekEarnings.scheduled}h escaladas`
                }
              </p>
            </Card>
            <Card variant="glass" className="text-center">
              <DollarSign className="mx-auto h-6 w-6 text-accent" />
              <p className="mt-2 text-2xl font-bold text-foreground">
                {formatCurrency(monthEarnings.total)}
              </p>
              <p className="text-xs text-muted-foreground">Ultimas 4 semanas</p>
              <p className="text-[10px] text-muted-foreground">
                {monthEarnings.hours.toFixed(0)}h em {monthEarnings.weeks} semana(s)
              </p>
            </Card>
          </div>

          {/* KPIs */}
          {myKPIs && (
            <Card variant="glass">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Award className="h-4 w-4 text-primary" />
                Meu Desempenho
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Assiduidade</p>
                  <p className={cn('text-2xl font-bold', myKPIs.assiduidade >= 95 ? 'text-success' : myKPIs.assiduidade >= 80 ? 'text-warning' : 'text-destructive')}>
                    {myKPIs.assiduidade.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {myKPIs.present} de {myKPIs.scheduledDays} dias
                  </p>
                </div>
                <div className="rounded-lg bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Pontualidade</p>
                  <p className={cn('text-2xl font-bold', myKPIs.pontualidade >= 95 ? 'text-success' : myKPIs.pontualidade >= 80 ? 'text-warning' : 'text-destructive')}>
                    {myKPIs.pontualidade.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {myKPIs.totalLate}min atraso total
                  </p>
                </div>
              </div>
              {myKPIs.absent > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {myKPIs.absent} falta(s) registrada(s)
                </div>
              )}
            </Card>
          )}

          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {new Date(weekDates[0] + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                {' — '}
                {new Date(weekDates[6] + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </span>
              {weekOffset === 0 && <Badge variant="success" size="sm">Atual</Badge>}
            </div>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Weekly schedule */}
          <div className="space-y-2">
            {weekSchedule.map((day) => {
              const d = new Date(day.date + 'T00:00:00')
              const isToday = day.date === new Date().toISOString().split('T')[0]
              const isPast = new Date(day.date) < new Date(new Date().toISOString().split('T')[0])
              const pontoRecord = state.pontoRecords.find(
                (p) => p.employeeId === selectedEmployeeId && p.date === day.date,
              )

              return (
                <Card
                  key={day.date}
                  className={cn(
                    'transition-all',
                    isToday && 'ring-1 ring-primary/30',
                    day.status === 'folga' && 'opacity-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-10 w-10 flex-col items-center justify-center rounded-lg text-xs',
                        isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        <span className="text-[10px] font-medium">{DAY_SHORT[d.getDay()]}</span>
                        <span className="text-sm font-bold">{d.getDate()}</span>
                      </div>
                      <div>
                        {day.hours > 0 ? (
                          <>
                            <p className="text-sm font-semibold text-foreground">
                              {day.shifts[0]?.start} — {day.shifts[0]?.end}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {day.hours}h &middot; {formatCurrency(day.hours * (employee?.hourlyRate ?? 0))}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Folga</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Ponto info */}
                      {pontoRecord && (
                        <div className="text-right text-[10px] text-muted-foreground">
                          {pontoRecord.checkIn && (
                            <p>
                              <span className="text-success">IN {new Date(pontoRecord.checkIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                              {pontoRecord.lateMinutes > 0 && <span className="text-warning"> +{pontoRecord.lateMinutes}m</span>}
                            </p>
                          )}
                          {pontoRecord.checkOut && (
                            <p className="text-foreground">
                              OUT {new Date(pontoRecord.checkOut).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Status / Actions */}
                      {day.hours > 0 && (
                        <>
                          {day.status === 'confirmed' ? (
                            <Badge variant="success" size="sm">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Confirmado
                            </Badge>
                          ) : day.status === 'declined' ? (
                            <Badge variant="destructive" size="sm">Recusado</Badge>
                          ) : day.status === 'pending' && !isPast ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleConfirm(day.date)}
                                className="rounded-lg bg-success/20 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/30"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => handleDecline(day.date)}
                                className="rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/30"
                              >
                                Recusar
                              </button>
                            </div>
                          ) : (
                            <Badge variant="muted" size="sm">
                              {isPast ? 'Concluido' : 'Pendente'}
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Week total */}
          {weekEarnings.scheduled > 0 && (
            <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">Total da semana</p>
              <p className="text-3xl font-bold text-foreground">
                {formatCurrency(weekEarnings.earnings)}
              </p>
              <p className="text-xs text-muted-foreground">
                {weekEarnings.scheduled}h escaladas
                {weekEarnings.pontoHours > 0 && ` | ${weekEarnings.worked.toFixed(1)}h trabalhadas`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
