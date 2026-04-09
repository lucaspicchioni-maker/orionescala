import { useState, useMemo, useEffect } from 'react'
import { CalendarDays, Send, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useApp } from '@/store/AppContext'
import { useToast } from '@/components/ui/Toast'
import { HOUR_RANGES } from '@/types'
import type { AvailabilityDeclaration, AvailabilitySlot, DayOfWeek } from '@/types'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

const DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']
const DAY_SHORT: Record<DayOfWeek, string> = {
  segunda: 'Seg',
  terca: 'Ter',
  quarta: 'Qua',
  quinta: 'Qui',
  sexta: 'Sex',
  sabado: 'Sáb',
  domingo: 'Dom',
}

function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${fmt(start)} — ${fmt(end)}`
}

export default function DisponibilidadePage() {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const loggedEmployeeId = state.currentUser.employeeId || ''
  const loggedEmployee = state.employees.find(e => e.id === loggedEmployeeId)

  // Week navigation — default to next week
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date()
    const thisWeek = getWeekStart(today)
    return addWeeks(thisWeek, 1)
  })

  // Load from API when week changes
  useEffect(() => {
    api.get<AvailabilityDeclaration[]>(`/api/availabilities/week/${weekStart}`)
      .then(data => dispatch({ type: 'SET_AVAILABILITIES', payload: data }))
      .catch(() => {})
  }, [weekStart, dispatch])

  // Selected cells: key = "day|hourRange"
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Check if there's already a submission for this week
  const existingDeclaration = useMemo(
    () =>
      state.availabilities.find(
        a => a.employeeId === loggedEmployeeId && a.weekStart === weekStart
      ),
    [state.availabilities, loggedEmployeeId, weekStart]
  )

  // Rehydrate selection when week or existing declaration changes
  useEffect(() => {
    if (existingDeclaration) {
      const keys = new Set<string>()
      existingDeclaration.slots.forEach(slot => {
        slot.hours.forEach(hr => keys.add(`${slot.day}|${hr}`))
      })
      setSelected(keys)
    } else {
      setSelected(new Set())
    }
  }, [weekStart, existingDeclaration?.id])

  const totalHours = selected.size
  const status: 'draft' | 'submitted' = existingDeclaration?.status === 'submitted' ? 'submitted' : 'draft'

  function toggleCell(day: DayOfWeek, hourRange: string) {
    if (status === 'submitted') return
    const key = `${day}|${hourRange}`
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  async function handleSubmit() {
    if (selected.size === 0) return

    // Build slots grouped by day
    const slotsMap: Record<string, string[]> = {}
    selected.forEach(key => {
      const [day, hr] = key.split('|')
      if (!slotsMap[day]) slotsMap[day] = []
      slotsMap[day].push(hr)
    })

    const slots: AvailabilitySlot[] = Object.entries(slotsMap).map(([day, hours]) => ({
      day: day as DayOfWeek,
      hours: hours.sort(),
    }))

    const declaration: AvailabilityDeclaration = {
      id: existingDeclaration?.id || crypto.randomUUID(),
      employeeId: loggedEmployeeId,
      weekStart,
      slots,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
    }

    try {
      await api.put('/api/availabilities', declaration)
      const fresh = await api.get<AvailabilityDeclaration[]>(`/api/availabilities/week/${weekStart}`)
      dispatch({ type: 'SET_AVAILABILITIES', payload: fresh })
      toast('success', 'Disponibilidade salva!')
    } catch {
      dispatch({ type: 'ADD_AVAILABILITY', payload: declaration })
      toast('error', 'Erro ao salvar disponibilidade. Salvo localmente.')
    }
  }

  // Dragging state for mobile/desktop painting
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add')

  function handlePointerDown(day: DayOfWeek, hourRange: string) {
    if (status === 'submitted') return
    const key = `${day}|${hourRange}`
    setIsDragging(true)
    setDragMode(selected.has(key) ? 'remove' : 'add')
    toggleCell(day, hourRange)
  }

  function handlePointerEnter(day: DayOfWeek, hourRange: string) {
    if (!isDragging || status === 'submitted') return
    const key = `${day}|${hourRange}`
    setSelected(prev => {
      const next = new Set(prev)
      if (dragMode === 'add') {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  function handlePointerUp() {
    setIsDragging(false)
  }

  return (
    <div className="space-y-4 pb-24" onPointerUp={handlePointerUp}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
          <CalendarDays className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Disponibilidade</h1>
          <p className="text-xs text-muted-foreground">
            {loggedEmployee?.name || 'Colaborador'}
          </p>
        </div>
      </div>

      {/* Week Selector */}
      <Card className="flex items-center justify-between p-3">
        <button
          onClick={() => setWeekStart(prev => addWeeks(prev, -1))}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          ←
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Semana</p>
          <p className="text-sm font-semibold text-foreground">
            {formatWeekLabel(weekStart)}
          </p>
        </div>
        <button
          onClick={() => setWeekStart(prev => addWeeks(prev, 1))}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          →
        </button>
      </Card>

      {/* Status + Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
              status === 'submitted'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-yellow-500/20 text-yellow-400'
            )}
          >
            {status === 'submitted' ? (
              <>
                <Check className="h-3 w-3" /> Enviada
              </>
            ) : (
              'Rascunho'
            )}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalHours}</span> horas disponíveis esta semana
        </p>
      </div>

      {/* Grid */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse select-none" style={{ touchAction: 'none' }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-xs font-medium text-muted-foreground border-b border-border min-w-[70px]">
                  Horário
                </th>
                {DAYS.map(day => (
                  <th
                    key={day}
                    className="px-1 py-2 text-center text-xs font-medium text-muted-foreground border-b border-border min-w-[48px]"
                  >
                    {DAY_SHORT[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOUR_RANGES.map(hr => (
                <tr key={hr} className="border-b border-border/50 last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-2 py-0.5 text-xs text-muted-foreground whitespace-nowrap font-mono">
                    {hr.split('-')[0]}
                  </td>
                  {DAYS.map(day => {
                    const key = `${day}|${hr}`
                    const isSelected = selected.has(key)
                    return (
                      <td key={key} className="p-0.5">
                        <button
                          onPointerDown={() => handlePointerDown(day, hr)}
                          onPointerEnter={() => handlePointerEnter(day, hr)}
                          disabled={status === 'submitted'}
                          className={cn(
                            'h-8 w-full rounded transition-colors',
                            isSelected
                              ? 'bg-emerald-500/70 hover:bg-emerald-500/90'
                              : 'bg-muted/40 hover:bg-muted/70',
                            status === 'submitted' && 'cursor-not-allowed opacity-70'
                          )}
                          aria-label={`${DAY_SHORT[day]} ${hr} — ${isSelected ? 'disponível' : 'indisponível'}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-emerald-500/70" /> Disponível
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-muted/40" /> Indisponível
        </span>
      </div>

      {/* Submit Button */}
      {status !== 'submitted' && (
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors',
            selected.size > 0
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <Send className="h-4 w-4" />
          Enviar Disponibilidade
        </button>
      )}

      {status === 'submitted' && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <Check className="h-4 w-4" />
          Disponibilidade enviada com sucesso
        </div>
      )}
    </div>
  )
}
