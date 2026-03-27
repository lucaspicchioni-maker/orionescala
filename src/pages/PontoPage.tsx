import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  LogIn,
  LogOut,
  Clock,
  Users,
  AlertTriangle,
  XCircle,
  Timer,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  MapPin,
  Settings,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import type { PontoRecord } from '@/types'

const DAY_SHORT: Record<number, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sab',
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]
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

function formatTime(isoDate: string | null): string {
  if (!isoDate) return '--:--'
  const d = new Date(isoDate)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${DAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getScheduledShiftsForDate(
  schedules: ReturnType<typeof useApp>['state']['schedules'],
  date: string,
  employeeId: string,
): { start: string; end: string } | null {
  for (const schedule of schedules) {
    for (const day of schedule.days) {
      if (day.date !== date) continue
      const assignedSlots: number[] = []
      day.slots.forEach((slot, idx) => {
        if (slot.assignments.some((a) => a.employeeId === employeeId)) {
          assignedSlots.push(idx)
        }
      })
      if (assignedSlots.length === 0) continue
      const startHour = day.slots[Math.min(...assignedSlots)].hour.split('-')[0]
      const endSlot = day.slots[Math.max(...assignedSlots)]
      const endHour = endSlot.hour.split('-')[1]
      return { start: startHour, end: endHour }
    }
  }
  return null
}

function calculateLateMinutes(scheduledStart: string, checkInTime: string): number {
  const [sh, sm] = scheduledStart.split(':').map(Number)
  const checkIn = new Date(checkInTime)
  const scheduledMinutes = sh * 60 + sm
  const actualMinutes = checkIn.getHours() * 60 + checkIn.getMinutes()
  return Math.max(0, actualMinutes - scheduledMinutes)
}

function calculateEarlyLeave(scheduledEnd: string, checkOutTime: string): number {
  const [eh, em] = scheduledEnd.split(':').map(Number)
  const checkOut = new Date(checkOutTime)
  const scheduledMinutes = eh * 60 + em
  const actualMinutes = checkOut.getHours() * 60 + checkOut.getMinutes()
  return Math.max(0, scheduledMinutes - actualMinutes)
}

export default function PontoPage() {
  const { state, dispatch } = useApp()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [showLocationConfig, setShowLocationConfig] = useState(false)
  const [locName, setLocName] = useState(state.locationConfig.name)
  const [locLat, setLocLat] = useState(String(state.locationConfig.lat))
  const [locLng, setLocLng] = useState(String(state.locationConfig.lng))
  const [locRadius, setLocRadius] = useState(String(state.locationConfig.radiusMeters))

  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset])
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  const todayRecords = useMemo(() => {
    return state.pontoRecords.filter((p) => p.date === selectedDate)
  }, [state.pontoRecords, selectedDate])

  const activeEmployees = useMemo(
    () => state.employees.filter((e) => e.status === 'ativo' && e.role !== 'gerente'),
    [state.employees],
  )

  // Build daily view: who's scheduled, who checked in, who's late
  const dailyView = useMemo(() => {
    return activeEmployees.map((emp) => {
      const shift = getScheduledShiftsForDate(state.schedules, selectedDate, emp.id)
      const record = todayRecords.find((r) => r.employeeId === emp.id)
      return { employee: emp, shift, record }
    }).filter((item) => item.shift !== null) // only show scheduled employees
  }, [activeEmployees, state.schedules, selectedDate, todayRecords])

  // Stats
  const stats = useMemo(() => {
    const scheduled = dailyView.length
    const checkedIn = dailyView.filter((d) => d.record?.checkIn).length
    const late = dailyView.filter((d) => d.record && d.record.lateMinutes > 0).length
    const absent = dailyView.filter((d) => !d.record || d.record.status === 'absent').length
    const avgLate = late > 0
      ? dailyView.reduce((s, d) => s + (d.record?.lateMinutes ?? 0), 0) / late
      : 0
    return { scheduled, checkedIn, late, absent, avgLate }
  }, [dailyView])

  const handleCheckIn = useCallback((employeeId: string) => {
    const now = new Date()
    const shift = getScheduledShiftsForDate(state.schedules, selectedDate, employeeId)
    const lateMinutes = shift ? calculateLateMinutes(shift.start, now.toISOString()) : 0

    const existing = state.pontoRecords.find(
      (p) => p.employeeId === employeeId && p.date === selectedDate,
    )

    if (existing) {
      dispatch({
        type: 'UPDATE_PONTO',
        payload: {
          ...existing,
          checkIn: now.toISOString(),
          lateMinutes,
          status: lateMinutes > 10 ? 'late' : 'on_time',
        },
      })
    } else {
      const record: PontoRecord = {
        id: crypto.randomUUID(),
        employeeId,
        date: selectedDate,
        scheduledStart: shift?.start ?? null,
        scheduledEnd: shift?.end ?? null,
        checkIn: now.toISOString(),
        checkOut: null,
        checkInLocation: null,
        checkOutLocation: null,
        checkInDistance: null,
        checkOutDistance: null,
        lateMinutes,
        earlyLeaveMinutes: 0,
        workedMinutes: 0,
        status: lateMinutes > 10 ? 'late' : 'on_time',
        notes: '',
      }
      dispatch({ type: 'ADD_PONTO', payload: record })
    }
  }, [state.schedules, state.pontoRecords, selectedDate, dispatch])

  const handleCheckOut = useCallback((employeeId: string) => {
    const now = new Date()
    const record = state.pontoRecords.find(
      (p) => p.employeeId === employeeId && p.date === selectedDate,
    )
    if (!record || !record.checkIn) return

    const checkInTime = new Date(record.checkIn)
    const workedMinutes = Math.round((now.getTime() - checkInTime.getTime()) / 60000)
    const earlyLeaveMinutes = record.scheduledEnd
      ? calculateEarlyLeave(record.scheduledEnd, now.toISOString())
      : 0

    dispatch({
      type: 'UPDATE_PONTO',
      payload: {
        ...record,
        checkOut: now.toISOString(),
        workedMinutes,
        earlyLeaveMinutes,
        status: earlyLeaveMinutes > 15 ? 'partial' : record.status,
      },
    })
  }, [state.pontoRecords, selectedDate, dispatch])

  const markAbsent = useCallback((employeeId: string) => {
    const shift = getScheduledShiftsForDate(state.schedules, selectedDate, employeeId)
    const existing = state.pontoRecords.find(
      (p) => p.employeeId === employeeId && p.date === selectedDate,
    )

    if (existing) {
      dispatch({
        type: 'UPDATE_PONTO',
        payload: { ...existing, status: 'absent' },
      })
    } else {
      const record: PontoRecord = {
        id: crypto.randomUUID(),
        employeeId,
        date: selectedDate,
        scheduledStart: shift?.start ?? null,
        scheduledEnd: shift?.end ?? null,
        checkIn: null,
        checkOut: null,
        checkInLocation: null,
        checkOutLocation: null,
        checkInDistance: null,
        checkOutDistance: null,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workedMinutes: 0,
        status: 'absent',
        notes: '',
      }
      dispatch({ type: 'ADD_PONTO', payload: record })
    }
  }, [state.schedules, state.pontoRecords, selectedDate, dispatch])

  // Week summary for each employee
  const weekSummary = useMemo(() => {
    return activeEmployees.map((emp) => {
      const records = state.pontoRecords.filter(
        (p) => p.employeeId === emp.id && weekDates.includes(p.date),
      )
      const daysScheduled = weekDates.filter((d) =>
        getScheduledShiftsForDate(state.schedules, d, emp.id),
      ).length
      const daysPresent = records.filter((r) => r.status === 'on_time' || r.status === 'late').length
      const totalLateMinutes = records.reduce((s, r) => s + r.lateMinutes, 0)
      const totalWorkedMinutes = records.reduce((s, r) => s + r.workedMinutes, 0)
      const absences = records.filter((r) => r.status === 'absent').length

      return {
        employee: emp,
        daysScheduled,
        daysPresent,
        absences,
        totalLateMinutes,
        totalWorkedMinutes,
        attendance: daysScheduled > 0 ? (daysPresent / daysScheduled) * 100 : 0,
      }
    }).filter((s) => s.daysScheduled > 0)
  }, [activeEmployees, state.pontoRecords, state.schedules, weekDates])

  const isToday = selectedDate === getToday()

  return (
    <div className="animate-fade-in space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-7 w-7 text-primary" />
            Controle de Ponto
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check-in, check-out e controle de atrasos
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/checkin"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Smartphone className="h-4 w-4" />
            Tela Check-in
          </Link>
          <button
            onClick={() => setShowLocationConfig(true)}
            className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <MapPin className="h-4 w-4" />
            Local GPS
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Escalados Hoje"
          value={stats.scheduled}
          unit="pessoas"
          icon={Users}
          trend="stable"
        />
        <MetricCard
          label="Check-ins"
          value={stats.checkedIn}
          unit={`de ${stats.scheduled}`}
          icon={LogIn}
          trend={stats.checkedIn >= stats.scheduled ? 'up' : 'stable'}
        />
        <MetricCard
          label="Atrasos"
          value={stats.late}
          unit="pessoas"
          icon={AlertTriangle}
          trend={stats.late === 0 ? 'up' : 'down'}
        />
        <MetricCard
          label="Atraso Medio"
          value={Math.round(stats.avgLate)}
          unit="min"
          icon={Timer}
          trend={stats.avgLate <= 5 ? 'up' : 'down'}
        />
      </div>

      {/* Week navigation + date selection */}
      <Card variant="glass" className="flex items-center justify-between">
        <button
          onClick={() => { setWeekOffset((o) => o - 1); setSelectedDate(getWeekDates(getWeekStart(weekOffset - 1))[0]) }}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex gap-1 overflow-x-auto">
          {weekDates.map((date) => {
            const isSelected = date === selectedDate
            const d = new Date(date + 'T00:00:00')
            const isTodayDate = date === getToday()
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  'flex flex-col items-center rounded-lg px-3 py-2 text-xs font-medium transition-all min-w-[52px]',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : isTodayDate
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span>{DAY_SHORT[d.getDay()]}</span>
                <span className="text-lg font-bold">{d.getDate()}</span>
              </button>
            )
          })}
        </div>
        <button
          onClick={() => { setWeekOffset((o) => o + 1); setSelectedDate(getWeekDates(getWeekStart(weekOffset + 1))[0]) }}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </Card>

      {/* Daily Ponto */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Ponto do Dia — {formatDateShort(selectedDate)}
          {isToday && <Badge variant="success" size="sm">Hoje</Badge>}
        </h3>

        {dailyView.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum colaborador escalado para este dia.
          </div>
        ) : (
          <div className="space-y-2">
            {dailyView.map(({ employee, shift, record }) => {
              const hasCheckedIn = !!record?.checkIn
              const hasCheckedOut = !!record?.checkOut
              const isAbsent = record?.status === 'absent'
              const isLate = record && record.lateMinutes > 10

              return (
                <div
                  key={employee.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-4 py-3 transition-all',
                    isAbsent ? 'border-destructive/30 bg-destructive/5' :
                    isLate ? 'border-warning/30 bg-warning/5' :
                    hasCheckedIn ? 'border-success/30 bg-success/5' :
                    'border-border bg-card',
                  )}
                >
                  {/* Employee info */}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold',
                      isAbsent ? 'bg-destructive/20 text-destructive' :
                      isLate ? 'bg-warning/20 text-warning' :
                      hasCheckedIn ? 'bg-success/20 text-success' :
                      'bg-primary/10 text-primary',
                    )}>
                      {employee.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{employee.nickname || employee.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Escala: {shift?.start} - {shift?.end}
                      </p>
                    </div>
                  </div>

                  {/* Check-in/out times */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-center">
                      <p className="text-muted-foreground">Entrada</p>
                      <p className={cn('font-semibold', hasCheckedIn ? (isLate ? 'text-warning' : 'text-success') : 'text-muted-foreground')}>
                        {formatTime(record?.checkIn ?? null)}
                      </p>
                      {isLate && (
                        <p className="text-[10px] text-warning">+{record!.lateMinutes}min</p>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Saida</p>
                      <p className={cn('font-semibold', hasCheckedOut ? 'text-foreground' : 'text-muted-foreground')}>
                        {formatTime(record?.checkOut ?? null)}
                      </p>
                      {record && record.earlyLeaveMinutes > 0 && (
                        <p className="text-[10px] text-warning">-{record.earlyLeaveMinutes}min</p>
                      )}
                    </div>
                    {record && record.workedMinutes > 0 && (
                      <div className="text-center">
                        <p className="text-muted-foreground">Trabalhado</p>
                        <p className="font-semibold text-foreground">
                          {Math.floor(record.workedMinutes / 60)}h{record.workedMinutes % 60}m
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Status badge + actions */}
                  <div className="flex items-center gap-2">
                    {isAbsent ? (
                      <Badge variant="destructive" size="sm">Ausente</Badge>
                    ) : isLate ? (
                      <Badge variant="warning" size="sm">Atrasado</Badge>
                    ) : hasCheckedOut ? (
                      <Badge variant="muted" size="sm">Finalizado</Badge>
                    ) : hasCheckedIn ? (
                      <Badge variant="success" size="sm">Presente</Badge>
                    ) : (
                      <Badge variant="muted" size="sm">Aguardando</Badge>
                    )}

                    {isToday && !isAbsent && !hasCheckedOut && (
                      <div className="flex gap-1">
                        {!hasCheckedIn ? (
                          <>
                            <button
                              onClick={() => handleCheckIn(employee.id)}
                              className="flex items-center gap-1 rounded-lg bg-success/20 px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/30"
                            >
                              <LogIn className="h-3.5 w-3.5" />
                              Check-in
                            </button>
                            <button
                              onClick={() => markAbsent(employee.id)}
                              className="flex items-center gap-1 rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/30"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Falta
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleCheckOut(employee.id)}
                            className="flex items-center gap-1 rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/30"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            Check-out
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Week Summary */}
      {weekSummary.length > 0 && (
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-4 w-4" />
            Resumo da Semana
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5">Colaborador</th>
                  <th className="px-3 py-2.5 text-center">Dias Escalados</th>
                  <th className="px-3 py-2.5 text-center">Presencas</th>
                  <th className="px-3 py-2.5 text-center">Faltas</th>
                  <th className="px-3 py-2.5 text-center">Atraso Total</th>
                  <th className="px-3 py-2.5 text-center">Horas Trabalhadas</th>
                  <th className="px-3 py-2.5">Assiduidade</th>
                </tr>
              </thead>
              <tbody>
                {weekSummary.map(({ employee, daysScheduled, daysPresent, absences, totalLateMinutes, totalWorkedMinutes, attendance }) => (
                  <tr key={employee.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {employee.name.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{employee.nickname || employee.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{daysScheduled}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-medium text-success">{daysPresent}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('font-medium', absences > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {absences}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('font-medium', totalLateMinutes > 30 ? 'text-warning' : 'text-muted-foreground')}>
                        {totalLateMinutes}min
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">
                      {Math.floor(totalWorkedMinutes / 60)}h{totalWorkedMinutes % 60}m
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(attendance, 100)}%`,
                              backgroundColor: attendance >= 95 ? '#22c55e' : attendance >= 80 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{attendance.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Location Config Modal */}
      {showLocationConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowLocationConfig(false)}
        >
          <div
            className="glass-strong mx-4 w-full max-w-md rounded-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 flex items-center gap-2 text-lg font-bold text-foreground">
              <Settings className="h-5 w-5 text-primary" />
              Configurar Localizacao GPS
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Defina as coordenadas da cozinha para validar check-in por proximidade.
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome do local</label>
                <input
                  type="text"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  placeholder="Cozinha Orion"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Latitude</label>
                  <input
                    type="text"
                    value={locLat}
                    onChange={(e) => setLocLat(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    placeholder="-23.550520"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Longitude</label>
                  <input
                    type="text"
                    value={locLng}
                    onChange={(e) => setLocLng(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    placeholder="-46.633309"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Raio maximo (metros)</label>
                <input
                  type="number"
                  value={locRadius}
                  onChange={(e) => setLocRadius(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  placeholder="150"
                />
              </div>

              <button
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setLocLat(String(pos.coords.latitude))
                        setLocLng(String(pos.coords.longitude))
                      },
                      () => {},
                      { enableHighAccuracy: true },
                    )
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <MapPin className="h-4 w-4" />
                Usar minha localizacao atual
              </button>

              <p className="text-[10px] text-muted-foreground">
                Dica: va ate a cozinha e clique &quot;Usar minha localizacao atual&quot; para pegar as coordenadas exatas.
              </p>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowLocationConfig(false)}
                className="flex-1 rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  dispatch({
                    type: 'SET_LOCATION_CONFIG',
                    payload: {
                      name: locName,
                      lat: parseFloat(locLat) || 0,
                      lng: parseFloat(locLng) || 0,
                      radiusMeters: parseInt(locRadius) || 150,
                    },
                  })
                  setShowLocationConfig(false)
                }}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
