import { useState, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  Plus,
  X,
  Check,
  AlertTriangle,
  Clock,
  Users,
  Send,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MessageCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { getScheduleSuggestions } from '@/services/aiService'
import type { ScheduleSuggestResult } from '@/services/aiService'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { week1Data } from '@/data/dph'
import { api, hasToken } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'
import { useApp } from '@/store/AppContext'
import type { Employee } from '@/types'
import { HOUR_RANGES, MIN_SHIFT_HOURS } from '@/types'

import type { WeekSchedule, ScheduleDayData } from '@/store/AppContext'
import { generateNotificationsForSchedule } from '@/services/notifications'

// ─── Constants ─────────────────────────────────────────────────────

const DAY_KEYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const
const DAY_SHORT: Record<string, string> = {
  segunda: 'Seg', terca: 'Ter', quarta: 'Qua',
  quinta: 'Qui', sexta: 'Sex', sabado: 'Sab', domingo: 'Dom',
}
const DAY_LABELS_FULL: Record<string, string> = {
  segunda: 'Segunda-feira', terca: 'Terça-feira', quarta: 'Quarta-feira',
  quinta: 'Quinta-feira', sexta: 'Sexta-feira', sabado: 'Sábado', domingo: 'Domingo',
}

const ROLE_LABELS: Record<string, string> = {
  auxiliar: 'Auxiliar', lider: 'Líder', supervisor: 'Supervisor', gerente: 'Gerente',
}

// ─── Helpers ───────────────────────────────────────────────────────

function getWeekStart(offset: number): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7
  const monday = new Date(now.setDate(diff))
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

function formatWeekRange(weekStart: string): string {
  const dates = getWeekDates(weekStart)
  return `${formatDateShort(dates[0])} — ${formatDateShort(dates[6])}`
}

function buildEmptySchedule(weekStart: string): WeekSchedule {
  const dates = getWeekDates(weekStart)
  return {
    weekStart,
    published: false,
    publishedAt: null,
    days: DAY_KEYS.map((dayKey, i) => {
      const dayData = week1Data.find((d) => d.day === dayKey)
      return {
        date: dates[i],
        dayOfWeek: dayKey,
        slots: (dayData?.hours ?? []).map((h, hi) => ({
          hour: HOUR_RANGES[hi],
          requiredPeople: h.people,
          assignments: [],
        })),
      }
    }),
  }
}

function getEmployeeHoursForDay(
  dayData: ScheduleDayData,
  employeeId: string,
): number {
  return dayData.slots.filter((s) =>
    s.assignments.some((a) => a.employeeId === employeeId),
  ).length
}

function getEmployeeHoursForWeek(
  schedule: WeekSchedule,
  employeeId: string,
): number {
  return schedule.days.reduce(
    (sum, day) => sum + getEmployeeHoursForDay(day, employeeId),
    0,
  )
}

function getConsecutiveHoursIfAssigned(
  dayData: ScheduleDayData,
  employeeId: string,
  targetSlotIndex: number,
): number {
  // Simulate what would happen if we assign this employee to targetSlotIndex
  const assigned = new Set<number>()
  dayData.slots.forEach((s, i) => {
    if (s.assignments.some((a) => a.employeeId === employeeId)) {
      assigned.add(i)
    }
  })
  assigned.add(targetSlotIndex)

  // Find the contiguous block containing targetSlotIndex
  let start = targetSlotIndex
  while (assigned.has(start - 1)) start--
  let end = targetSlotIndex
  while (assigned.has(end + 1)) end++
  return end - start + 1
}

function isEmployeeAssignedAtHour(
  dayData: ScheduleDayData,
  slotIndex: number,
  employeeId: string,
): boolean {
  return dayData.slots[slotIndex]?.assignments.some(
    (a) => a.employeeId === employeeId,
  ) ?? false
}

// ─── Modal backdrop ────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────

export default function EscalaPage() {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset])

  const schedule = useMemo(() => {
    const existing = state.schedules.find((s) => s.weekStart === weekStart)
    return existing ?? buildEmptySchedule(weekStart)
  }, [state.schedules, weekStart])

  const persistSchedule = useCallback(
    async (updated: WeekSchedule) => {
      dispatch({ type: 'SET_SCHEDULE', payload: updated })
      if (!hasToken()) return
      setIsSaving(true)
      try {
        const saved = await api.put<WeekSchedule>(`/api/schedules/${updated.weekStart}`, updated)
        dispatch({ type: 'SET_SCHEDULE', payload: saved })
      } catch {
        // silently ignore — local state already updated
      } finally {
        setIsSaving(false)
      }
    },
    [dispatch],
  )

  const copyFromPreviousWeek = useCallback(() => {
    const prevDate = new Date(weekStart + 'T00:00:00')
    prevDate.setDate(prevDate.getDate() - 7)
    const prevWeekStart = prevDate.toISOString().split('T')[0]
    const prevSchedule = state.schedules.find(s => s.weekStart === prevWeekStart)

    const dates = getWeekDates(weekStart)
    const newSchedule: WeekSchedule = {
      weekStart,
      published: false,
      publishedAt: null,
      days: DAY_KEYS.map((dayKey, i) => {
        const source = prevSchedule
          ? prevSchedule.days.find(d => d.dayOfWeek === dayKey)
          : null
        const fallback = week1Data.find(d => d.day === dayKey)
        const slots = source
          ? source.slots.map(s => ({ ...s, assignments: [], id: crypto.randomUUID() }))
          : (fallback?.hours ?? []).map((h, hi) => ({
              hour: h.hour,
              requiredPeople: h.people,
              assignments: [],
            }))
        return { date: dates[i], dayOfWeek: dayKey, slots }
      }),
    }
    persistSchedule(newSchedule)
    toast('success', prevSchedule ? 'Estrutura da semana anterior copiada!' : 'Nova escala criada com dados base.')
  }, [weekStart, state.schedules, persistSchedule, toast])

  const [isSaving, setIsSaving] = useState(false)
  const [editingDemand, setEditingDemand] = useState(false)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [assignModalSlot, setAssignModalSlot] = useState<{
    dayIndex: number
    slotIndex: number
  } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{
    dayIndex: number
    slotIndex: number
    assignmentId: string
  } | null>(null)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showNotifyPanel, setShowNotifyPanel] = useState(false)
  const [shiftWarning, setShiftWarning] = useState<string | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<ScheduleSuggestResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)

  async function analyzeWithAI() {
    setAiLoading(true)
    setAiError(null)
    setAiOpen(true)
    try {
      const result = await getScheduleSuggestions({ schedule, employees: activeEmployees, weekStart })
      setAiSuggestions(result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao consultar IA')
    } finally {
      setAiLoading(false)
    }
  }

  const employees = state.employees
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'ativo'),
    [employees],
  )

  const selectedDay = schedule.days[selectedDayIndex]

  // ─── Computed stats ────────────────────────────────────────────

  const dayStats = useMemo(() => {
    return schedule.days.map((day) => {
      const totalRequired = day.slots.reduce((s, sl) => s + sl.requiredPeople, 0)
      const totalFilled = day.slots.reduce((s, sl) => s + sl.assignments.length, 0)
      return { totalRequired, totalFilled }
    })
  }, [schedule])

  const selectedDayStats = dayStats[selectedDayIndex]
  const allSlotsFilled = dayStats.every((d) => d.totalFilled >= d.totalRequired)

  const selectedDayCost = useMemo(() => {
    if (!selectedDay) return 0
    return selectedDay.slots.reduce((sum, slot) => {
      return (
        sum +
        slot.assignments.reduce((as, a) => {
          const emp = employees.find((e) => e.id === a.employeeId)
          return as + (emp?.hourlyRate ?? 0)
        }, 0)
      )
    }, 0)
  }, [selectedDay])

  const totalWeekCost = useMemo(() => {
    return schedule.days.reduce(
      (wsum, day) =>
        wsum +
        day.slots.reduce(
          (dsum, slot) =>
            dsum +
            slot.assignments.reduce((asum, a) => {
              const emp = employees.find((e) => e.id === a.employeeId)
              return asum + (emp?.hourlyRate ?? 0)
            }, 0),
          0,
        ),
      0,
    )
  }, [schedule])

  const statusLabel = schedule.published
    ? 'Publicada'
    : allSlotsFilled
      ? 'Rascunho'
      : 'Incompleta'
  const statusVariant = schedule.published
    ? 'success'
    : allSlotsFilled
      ? 'default'
      : 'warning'

  // ─── Actions ───────────────────────────────────────────────────

  const assignEmployee = useCallback(
    (dayIndex: number, slotIndex: number, employeeId: string) => {
      const updated: WeekSchedule = JSON.parse(JSON.stringify(schedule))
      const day = updated.days[dayIndex]
      const slot = day.slots[slotIndex]

      // Check if already assigned at this hour
      if (slot.assignments.some((a) => a.employeeId === employeeId)) return

      // Check consecutive hours warning
      const consecutive = getConsecutiveHoursIfAssigned(day, employeeId, slotIndex)
      const currentHours = getEmployeeHoursForDay(day, employeeId)

      // Only warn if this creates a non-contiguous isolated block < MIN_SHIFT_HOURS
      // after the assignment, check if the total block is still < MIN_SHIFT_HOURS
      if (consecutive < MIN_SHIFT_HOURS && currentHours + 1 < MIN_SHIFT_HOURS) {
        // Show warning but still allow
        setShiftWarning(
          `Atenção: turno com menos de ${MIN_SHIFT_HOURS}h consecutivas para este colaborador.`,
        )
        setTimeout(() => setShiftWarning(null), 4000)
      }

      slot.assignments.push({
        id: crypto.randomUUID(),
        employeeId,
        status: 'pending',
        confirmedAt: null,
      })
      void persistSchedule(updated)
      setAssignModalSlot(null)
    },
    [schedule, persistSchedule],
  )

  const removeAssignment = useCallback(
    (dayIndex: number, slotIndex: number, assignmentId: string) => {
      const updated: WeekSchedule = JSON.parse(JSON.stringify(schedule))
      const slot = updated.days[dayIndex].slots[slotIndex]
      slot.assignments = slot.assignments.filter((a) => a.id !== assignmentId)
      void persistSchedule(updated)
      setConfirmRemove(null)
    },
    [schedule, persistSchedule],
  )

  const updateRequiredPeople = useCallback(
    (dayIndex: number, slotIndex: number, delta: number) => {
      const updated: WeekSchedule = JSON.parse(JSON.stringify(schedule))
      const slot = updated.days[dayIndex].slots[slotIndex]
      slot.requiredPeople = Math.max(0, slot.requiredPeople + delta)
      void persistSchedule(updated)
    },
    [schedule, persistSchedule],
  )

  const handleRemoveClick = useCallback(
    (dayIndex: number, slotIndex: number, assignmentId: string) => {
      if (schedule.published) {
        // Check 24h rule
        const slotDate = schedule.days[dayIndex].date
        const now = new Date()
        const slotDateTime = new Date(slotDate + 'T00:00:00')
        const hoursUntil =
          (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
        if (hoursUntil < 24) {
          setShiftWarning(
            'Não é possível remover atribuições com menos de 24h de antecedência.',
          )
          setTimeout(() => setShiftWarning(null), 4000)
          return
        }
        setConfirmRemove({ dayIndex, slotIndex, assignmentId })
      } else {
        removeAssignment(dayIndex, slotIndex, assignmentId)
      }
    },
    [schedule, removeAssignment],
  )

  const publishSchedule = useCallback(async () => {
    setIsSaving(true)
    try {
      // Save latest state first, then publish
      if (hasToken()) {
        await api.put<WeekSchedule>(`/api/schedules/${weekStart}`, schedule)
        const published = await api.post<WeekSchedule>(`/api/schedules/${weekStart}/publish`, {})
        dispatch({ type: 'SET_SCHEDULE', payload: published })
      } else {
        const updated: WeekSchedule = JSON.parse(JSON.stringify(schedule))
        updated.published = true
        updated.publishedAt = new Date().toISOString()
        dispatch({ type: 'SET_SCHEDULE', payload: updated })
      }

      // Local notifications
      const nameMap: Record<string, string> = {}
      for (const emp of employees) nameMap[emp.id] = emp.nickname || emp.name
      const notifications = generateNotificationsForSchedule(schedule, nameMap)
      if (notifications.length > 0) dispatch({ type: 'ADD_NOTIFICATIONS', payload: notifications })

      const convocated = new Set<string>()
      schedule.days.forEach(day => day.slots.forEach(slot => slot.assignments.forEach(a => convocated.add(a.employeeId))))
      toast('success', `Escala publicada! ${convocated.size} colaborador${convocated.size === 1 ? '' : 'es'} convocado${convocated.size === 1 ? '' : 's'}.`)
      setShowPublishModal(false)
      setShowNotifyPanel(true)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao publicar escala')
    } finally {
      setIsSaving(false)
    }
  }, [schedule, weekStart, employees, dispatch, toast])

  const buildWhatsAppLink = useCallback(
    (emp: Employee) => {
      const weekRange = formatWeekRange(schedule.weekStart)
      const hoursThisWeek = getEmployeeHoursForWeek(schedule, emp.id)
      const text = encodeURIComponent(
        `Olá ${emp.nickname}! Sua escala da semana ${weekRange} foi publicada. ` +
          `Você tem ${hoursThisWeek}h agendadas. Confira os detalhes no app.`,
      )
      const phone = emp.phone.replace(/\D/g, '')
      return `https://wa.me/${phone ? phone : ''}?text=${text}`
    },
    [schedule],
  )

  // ─── Current hour for highlighting ──────────────────────────────
  const currentHourIndex = useMemo(() => {
    const h = new Date().getHours()
    if (h >= 9 && h <= 23) return h - 9
    if (h === 0) return 15
    return -1
  }, [])

  // ─── Employee panel data ────────────────────────────────────────
  const employeePanelData = useMemo(() => {
    return activeEmployees.map((emp) => {
      const hoursToday = selectedDay
        ? getEmployeeHoursForDay(selectedDay, emp.id)
        : 0
      const hoursWeek = getEmployeeHoursForWeek(schedule, emp.id)
      return { ...emp, hoursToday, hoursWeek }
    })
  }, [activeEmployees, selectedDay, schedule])

  // ─── Publish summary ───────────────────────────────────────────
  const publishSummary = useMemo(() => {
    const totalSlots = dayStats.reduce((s, d) => s + d.totalFilled, 0)
    const totalRequired = dayStats.reduce((s, d) => s + d.totalRequired, 0)
    const uniqueEmployees = new Set<string>()
    schedule.days.forEach((day) =>
      day.slots.forEach((slot) =>
        slot.assignments.forEach((a) => uniqueEmployees.add(a.employeeId)),
      ),
    )
    return {
      totalSlots,
      totalRequired,
      totalHours: totalSlots,
      totalCost: totalWeekCost,
      uniquePeople: uniqueEmployees.size,
    }
  }, [dayStats, schedule, totalWeekCost])

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-4 p-4 lg:p-6">
      {/* Shift warning toast */}
      {shiftWarning && (
        <div className="fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-lg bg-warning/20 px-4 py-3 text-sm text-warning shadow-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {shiftWarning}
        </div>
      )}

      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Escala Semanal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie a escala de trabalho semanal
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Copy previous week */}
          {!schedule.published && (
            <button
              onClick={copyFromPreviousWeek}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Copiar estrutura da semana anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Copiar sem. ant.
            </button>
          )}
          {/* Edit demand toggle — gerente/admin only */}
          {!schedule.published && (
            <button
              onClick={() => setEditingDemand(v => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                editingDemand
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {editingDemand ? 'Editando Demanda' : 'Editar Demanda'}
            </button>
          )}
          <button
            onClick={aiOpen && aiSuggestions ? () => setAiOpen(v => !v) : analyzeWithAI}
            disabled={aiLoading}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiLoading ? 'Analisando...' : 'IA'}
            {aiOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <Badge variant={statusVariant as 'default' | 'success' | 'warning'} size="md">
            {isSaving ? 'Salvando...' : statusLabel}
          </Badge>
          <button
            disabled={!allSlotsFilled || schedule.published || isSaving}
            onClick={() => setShowPublishModal(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
              allSlotsFilled && !schedule.published
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-primary/20 text-primary/50',
            )}
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Publicar Escala</span>
            <span className="sm:hidden">Publicar</span>
          </button>
        </div>
      </div>

      {/* ─── Week selector ──────────────────────────────────────── */}
      <Card variant="glass" className="flex items-center justify-between">
        <button
          onClick={() => { setWeekOffset((o) => o - 1); setSelectedDayIndex(0) }}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">
            {formatWeekRange(weekStart)}
          </span>
          {weekOffset === 0 && (
            <Badge variant="default" size="sm">Esta semana</Badge>
          )}
        </div>
        <button
          onClick={() => { setWeekOffset((o) => o + 1); setSelectedDayIndex(0) }}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </Card>

      {/* ─── AI Suggestions panel ──────────────────────────────── */}
      {aiOpen && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 space-y-2.5">
          {aiLoading && <p className="text-xs text-muted-foreground animate-pulse">Claude está analisando a escala...</p>}
          {aiError && <p className="text-xs text-destructive">{aiError}</p>}
          {aiSuggestions && (
            <>
              <p className="text-xs text-foreground">{aiSuggestions.analysis}</p>
              {aiSuggestions.problems.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Problemas</p>
                  {aiSuggestions.problems.map((p, i) => (
                    <div key={i} className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{p}</div>
                  ))}
                </div>
              )}
              {aiSuggestions.suggestions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Sugestões</p>
                  {aiSuggestions.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{s}
                    </div>
                  ))}
                </div>
              )}
              {aiSuggestions.priority_slots.length > 0 && (
                <p className="text-xs text-warning">
                  ⚠️ Slots prioritários: {aiSuggestions.priority_slots.join(', ')}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Empty state nudge ─────────────────────────────────── */}
      {!state.schedules.find(s => s.weekStart === weekStart) && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-5 text-center">
          <Calendar className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Nenhuma escala para esta semana</p>
          <p className="mt-1 text-xs text-muted-foreground">Copie a estrutura da semana anterior ou edite a demanda para começar.</p>
          <button
            onClick={copyFromPreviousWeek}
            className="mt-3 rounded-lg bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            Copiar semana anterior
          </button>
        </div>
      )}

      {/* ─── Day tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-card p-1">
        {DAY_KEYS.map((dayKey, i) => {
          const stats = dayStats[i]
          const isActive = selectedDayIndex === i
          const isFull = stats.totalFilled >= stats.totalRequired
          return (
            <button
              key={dayKey}
              onClick={() => setSelectedDayIndex(i)}
              className={cn(
                'flex min-w-[4.5rem] flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-2.5 text-xs font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="font-semibold">{DAY_SHORT[dayKey]}</span>
              <span className={cn('text-[10px]', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/60')}>
                {formatDateShort(schedule.days[i].date)}
              </span>
              <span
                className={cn(
                  'mt-0.5 text-[10px] font-bold',
                  isActive
                    ? 'text-primary-foreground'
                    : isFull
                      ? 'text-success'
                      : 'text-warning',
                )}
              >
                {stats.totalFilled}/{stats.totalRequired}
              </span>
            </button>
          )
        })}
      </div>

      {/* ─── Main content area ──────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Schedule grid */}
        <div className="min-w-0 flex-1">
          <Card variant="glass" className="overflow-x-auto !p-0">
            <div className="min-w-[480px]">
              {/* Grid header */}
              <div className="grid grid-cols-[60px_40px_1fr_32px] items-center gap-1.5 border-b border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground sm:grid-cols-[80px_60px_1fr_40px] sm:gap-2 sm:px-4 sm:py-3">
                <span>Horario</span>
                <span className="text-center">Req.</span>
                <span>Atribuicoes</span>
                <span className="text-center">OK</span>
              </div>

              {/* Grid rows */}
              {selectedDay?.slots.map((slot, slotIdx) => {
                const filled = slot.assignments.length
                const isFull = filled >= slot.requiredPeople
                const isCurrentHour = slotIdx === currentHourIndex
                return (
                  <div
                    key={slot.hour}
                    className={cn(
                      'grid grid-cols-[60px_40px_1fr_32px] items-center gap-1.5 border-b border-border/50 px-3 py-2 transition-colors sm:grid-cols-[80px_60px_1fr_40px] sm:gap-2 sm:px-4 sm:py-2.5',
                      slotIdx % 2 === 0 ? 'bg-card' : 'bg-secondary/50',
                      isCurrentHour && 'ring-1 ring-primary/30 bg-primary/5',
                    )}
                  >
                    {/* Hour label */}
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isCurrentHour ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      <Clock className="mr-1 inline h-3 w-3" />
                      {slot.hour.split('-')[0]}
                    </span>

                    {/* Required count */}
                    {editingDemand && !schedule.published ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateRequiredPeople(selectedDayIndex, slotIdx, -1)}
                          className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive text-xs font-bold"
                        >−</button>
                        <span className="w-4 text-center text-xs font-bold text-accent">{slot.requiredPeople}</span>
                        <button
                          onClick={() => updateRequiredPeople(selectedDayIndex, slotIdx, 1)}
                          className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground hover:bg-success/20 hover:text-success text-xs font-bold"
                        >+</button>
                      </div>
                    ) : (
                      <span className="text-center text-xs font-bold text-foreground">
                        {slot.requiredPeople}
                      </span>
                    )}

                    {/* Assignment slots */}
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: slot.requiredPeople }, (_, aIdx) => {
                        const assignment = slot.assignments[aIdx]
                        if (assignment) {
                          const emp = employees.find(
                            (e) => e.id === assignment.employeeId,
                          )
                          return (
                            <div
                              key={assignment.id}
                              className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs"
                            >
                              {/* Avatar */}
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                                {emp?.name.charAt(0) ?? '?'}
                              </div>
                              <span className="font-medium text-foreground">
                                {emp?.nickname ?? emp?.name ?? 'Desconhecido'}
                              </span>
                              {/* Status dot */}
                              <div
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  assignment.status === 'confirmed'
                                    ? 'bg-success'
                                    : assignment.status === 'declined'
                                      ? 'bg-destructive'
                                      : 'bg-warning',
                                )}
                              />
                              <button
                                onClick={() =>
                                  handleRemoveClick(
                                    selectedDayIndex,
                                    slotIdx,
                                    assignment.id,
                                  )
                                }
                                className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )
                        }
                        return (
                          <button
                            key={`empty-${aIdx}`}
                            onClick={() =>
                              setAssignModalSlot({
                                dayIndex: selectedDayIndex,
                                slotIndex: slotIdx,
                              })
                            }
                            className="flex h-8 w-20 items-center justify-center rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground/50 transition-colors hover:border-primary/50 hover:text-primary"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )
                      })}
                      {/* Extra assignments beyond required */}
                      {slot.assignments.slice(slot.requiredPeople).map((assignment) => {
                        const emp = employees.find(
                          (e) => e.id === assignment.employeeId,
                        )
                        return (
                          <div
                            key={assignment.id}
                            className="flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1.5 text-xs"
                          >
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                              {emp?.name.charAt(0) ?? '?'}
                            </div>
                            <span className="font-medium text-foreground">
                              {emp?.nickname ?? emp?.name ?? 'Desconhecido'}
                            </span>
                            <button
                              onClick={() =>
                                handleRemoveClick(
                                  selectedDayIndex,
                                  slotIdx,
                                  assignment.id,
                                )
                              }
                              className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    {/* Status indicator */}
                    <div className="flex justify-center">
                      {isFull ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : filled > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-warning" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-muted-foreground/20" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* ─── Employee sidebar ──────────────────────────────────── */}
        <div className="w-full lg:w-72 xl:w-80">
          <Card variant="glass" className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Colaboradores
            </div>
            <div className="space-y-1.5">
              {employeePanelData.map((emp) => {
                const bookingLevel =
                  emp.hoursWeek >= 40
                    ? 'full'
                    : emp.hoursToday > 0
                      ? 'partial'
                      : 'available'
                return (
                  <div
                    key={emp.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2 transition-colors',
                      'cursor-grab border border-transparent hover:border-border hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {/* Status indicator */}
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full',
                          bookingLevel === 'available' && 'bg-success',
                          bookingLevel === 'partial' && 'bg-warning',
                          bookingLevel === 'full' && 'bg-destructive',
                        )}
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {emp.nickname}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {ROLE_LABELS[emp.role] ?? emp.role}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">
                        {emp.hoursToday}h hoje
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {emp.hoursWeek}h/sem
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* ─── Bottom summary bar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-card px-5 py-3 text-sm">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Preenchido:</span>
          <span className="font-semibold text-foreground">
            {selectedDayStats.totalFilled} / {selectedDayStats.totalRequired}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <span className="text-muted-foreground">Horas agendadas:</span>
          <span className="font-semibold text-foreground">
            {selectedDayStats.totalFilled}h
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Custo estimado (dia):</span>
          <span className="font-semibold text-primary">
            {formatCurrency(selectedDayCost)}
          </span>
        </div>
        {schedule.published && (
          <>
            <div className="h-4 w-px bg-border" />
            <button
              onClick={() => setShowNotifyPanel(true)}
              className="ml-auto flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent/80"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Notificações WhatsApp
            </button>
          </>
        )}
      </div>

      {/* ─── Assignment modal ──────────────────────────────────── */}
      <Modal
        open={assignModalSlot !== null}
        onClose={() => setAssignModalSlot(null)}
      >
        {assignModalSlot && (
          <>
            <h3 className="mb-1 text-lg font-bold text-foreground">
              Atribuir Colaborador
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Horário:{' '}
              {schedule.days[assignModalSlot.dayIndex]?.slots[assignModalSlot.slotIndex]?.hour}{' '}
              &mdash;{' '}
              {DAY_LABELS_FULL[schedule.days[assignModalSlot.dayIndex]?.dayOfWeek]}
            </p>
            <div className="space-y-1">
              {activeEmployees.map((emp) => {
                const alreadyAssigned = isEmployeeAssignedAtHour(
                  schedule.days[assignModalSlot.dayIndex],
                  assignModalSlot.slotIndex,
                  emp.id,
                )
                const consecutiveHours = getConsecutiveHoursIfAssigned(
                  schedule.days[assignModalSlot.dayIndex],
                  emp.id,
                  assignModalSlot.slotIndex,
                )
                const shortShiftWarning =
                  !alreadyAssigned && consecutiveHours < MIN_SHIFT_HOURS
                const hoursToday = getEmployeeHoursForDay(
                  schedule.days[assignModalSlot.dayIndex],
                  emp.id,
                )
                // Check lunch peak rule
                const slotHour = schedule.days[assignModalSlot.dayIndex]?.slots[assignModalSlot.slotIndex]?.hour ?? ''
                const isLunchPeak =
                  slotHour.startsWith('12:') || slotHour.startsWith('13:')

                return (
                  <button
                    key={emp.id}
                    disabled={alreadyAssigned}
                    onClick={() =>
                      assignEmployee(
                        assignModalSlot.dayIndex,
                        assignModalSlot.slotIndex,
                        emp.id,
                      )
                    }
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors',
                      alreadyAssigned
                        ? 'cursor-not-allowed bg-muted/30 opacity-50'
                        : 'bg-card hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {emp.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ROLE_LABELS[emp.role]} &middot;{' '}
                          {formatCurrency(emp.hourlyRate)}/h
                          {hoursToday > 0 && (
                            <span className="ml-1 text-accent">
                              ({hoursToday}h hoje)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {alreadyAssigned && (
                        <Badge variant="muted" size="sm">
                          Já atribuído
                        </Badge>
                      )}
                      {shortShiftWarning && !alreadyAssigned && (
                        <div title={`Turno ficará com ${consecutiveHours}h (mín. ${MIN_SHIFT_HOURS}h)`}>
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        </div>
                      )}
                      {isLunchPeak && !alreadyAssigned && (
                        <Badge variant="warning" size="sm">
                          Almoço
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </Modal>

      {/* ─── Confirm remove modal ──────────────────────────────── */}
      <Modal
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
      >
        {confirmRemove && (
          <div className="space-y-4 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
            <h3 className="text-lg font-bold text-foreground">
              Remover Atribuição
            </h3>
            <p className="text-sm text-muted-foreground">
              A escala já foi publicada. Tem certeza que deseja remover este
              colaborador deste horário?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  removeAssignment(
                    confirmRemove.dayIndex,
                    confirmRemove.slotIndex,
                    confirmRemove.assignmentId,
                  )
                }
                className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-destructive/90"
              >
                Confirmar Remoção
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Publish confirmation modal ───────────────────────── */}
      <Modal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
      >
        <div className="space-y-5">
          <div className="text-center">
            <Send className="mx-auto mb-2 h-10 w-10 text-primary" />
            <h3 className="text-lg font-bold text-foreground">
              Publicar Escala
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Revise o resumo antes de confirmar
            </p>
          </div>

          <div className="space-y-2 rounded-lg bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pessoas agendadas</span>
              <span className="font-semibold text-foreground">
                {publishSummary.uniquePeople}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total de horas</span>
              <span className="font-semibold text-foreground">
                {publishSummary.totalHours}h
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Slots preenchidos</span>
              <span className="font-semibold text-foreground">
                {publishSummary.totalSlots} / {publishSummary.totalRequired}
              </span>
            </div>
            <div className="border-t border-border pt-2" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Custo estimado</span>
              <span className="font-bold text-primary">
                {formatCurrency(publishSummary.totalCost)}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowPublishModal(false)}
              className="flex-1 rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80"
            >
              Cancelar
            </button>
            <button
              onClick={() => void publishSchedule()}
              disabled={isSaving}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isSaving ? 'Publicando...' : 'Confirmar e Notificar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── WhatsApp notification panel ──────────────────────── */}
      <Modal
        open={showNotifyPanel}
        onClose={() => setShowNotifyPanel(false)}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-success" />
            <h3 className="text-lg font-bold text-foreground">
              Notificar Colaboradores
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Envie a escala publicada por WhatsApp para cada colaborador.
          </p>
          <div className="space-y-2">
            {activeEmployees
              .filter((emp) => getEmployeeHoursForWeek(schedule, emp.id) > 0)
              .map((emp) => {
                const hours = getEmployeeHoursForWeek(schedule, emp.id)
                return (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between rounded-lg bg-card px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {emp.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {hours}h esta semana &middot;{' '}
                        {formatCurrency(hours * emp.hourlyRate)}
                      </p>
                    </div>
                    <a
                      href={buildWhatsAppLink(emp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-success/20 px-3 py-2 text-xs font-semibold text-success transition-colors hover:bg-success/30"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Enviar WhatsApp
                    </a>
                  </div>
                )
              })}
            {activeEmployees.filter(
              (emp) => getEmployeeHoursForWeek(schedule, emp.id) > 0,
            ).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhum colaborador agendado esta semana.
              </p>
            )}
          </div>
          <button
            onClick={() => setShowNotifyPanel(false)}
            className="w-full rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80"
          >
            Fechar
          </button>
        </div>
      </Modal>
    </div>
  )
}
