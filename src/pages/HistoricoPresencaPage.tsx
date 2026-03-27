import { useState, useMemo } from 'react'
import { useApp } from '@/store/AppContext'
import { CheckCircle, XCircle, AlertTriangle, Clock, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  on_time: { label: 'No horario', color: 'text-success', icon: CheckCircle },
  late: { label: 'Atrasado', color: 'text-warning', icon: AlertTriangle },
  absent: { label: 'Ausente', color: 'text-destructive', icon: XCircle },
  partial: { label: 'Parcial', color: 'text-warning', icon: Clock },
  pending: { label: 'Pendente', color: 'text-muted-foreground', icon: Clock },
  location_rejected: { label: 'Fora da area', color: 'text-destructive', icon: MapPin },
}

export default function HistoricoPresencaPage() {
  const { state } = useApp()
  const role = state.currentUser.role
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [monthOffset, setMonthOffset] = useState(0)

  const activeEmployees = state.employees.filter(e => e.status === 'ativo')

  // For colaborador, auto-select self
  const loggedEmployeeId = localStorage.getItem('orion_logged_employee') || ''
  const effectiveEmployee = role === 'colaborador' ? loggedEmployeeId : selectedEmployee

  const currentMonth = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])

  const monthLabel = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // Get all days in the month
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const days: string[] = []
    const last = new Date(year, month + 1, 0).getDate()
    for (let d = 1; d <= last; d++) {
      days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
    return days
  }, [currentMonth])

  // Filter records for employee + month
  const records = useMemo(() => {
    if (!effectiveEmployee) return []
    const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
    return state.pontoRecords.filter(p => p.employeeId === effectiveEmployee && p.date.startsWith(month))
  }, [effectiveEmployee, currentMonth, state.pontoRecords])

  const recordMap = useMemo(() => {
    const m: Record<string, typeof records[0]> = {}
    records.forEach(r => { m[r.date] = r })
    return m
  }, [records])

  // Stats
  const stats = useMemo(() => {
    const total = records.length
    const onTime = records.filter(r => r.status === 'on_time').length
    const late = records.filter(r => r.status === 'late').length
    const absent = records.filter(r => r.status === 'absent').length
    const totalWorked = records.reduce((s, r) => s + r.workedMinutes, 0)
    const totalLate = records.reduce((s, r) => s + r.lateMinutes, 0)
    return { total, onTime, late, absent, totalWorked, totalLate, attendanceRate: total > 0 ? Math.round(((total - absent) / total) * 100) : 0 }
  }, [records])

  const empName = state.employees.find(e => e.id === effectiveEmployee)?.name || ''

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Historico de Presenca</h2>
          <p className="text-sm text-muted-foreground">Timeline visual de presenca e pontualidade</p>
        </div>

        {role !== 'colaborador' && (
          <select
            value={selectedEmployee}
            onChange={e => setSelectedEmployee(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="">Selecione colaborador</option>
            {activeEmployees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setMonthOffset(m => m - 1)} className="rounded-lg p-2 hover:bg-card">
          <ChevronLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium capitalize text-foreground">{monthLabel}</span>
        <button onClick={() => setMonthOffset(m => m + 1)} className="rounded-lg p-2 hover:bg-card" disabled={monthOffset >= 0}>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {!effectiveEmployee ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          Selecione um colaborador para ver o historico
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[
              { label: 'Dias', value: stats.total, color: 'text-foreground' },
              { label: 'No horario', value: stats.onTime, color: 'text-success' },
              { label: 'Atrasos', value: stats.late, color: 'text-warning' },
              { label: 'Faltas', value: stats.absent, color: 'text-destructive' },
              { label: 'Horas trab.', value: `${Math.floor(stats.totalWorked / 60)}h`, color: 'text-foreground' },
              { label: 'Assiduidade', value: `${stats.attendanceRate}%`, color: stats.attendanceRate >= 90 ? 'text-success' : 'text-warning' },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">{empName} - {monthLabel}</h3>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
                <div key={d} className="py-1 font-medium text-muted-foreground">{d}</div>
              ))}

              {/* Empty cells for offset */}
              {Array.from({ length: new Date(daysInMonth[0] + 'T00:00:00').getDay() }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {daysInMonth.map(date => {
                const record = recordMap[date]
                const dayNum = parseInt(date.split('-')[2])
                const today = new Date().toISOString().split('T')[0]
                const isToday = date === today
                const isPast = date < today

                let bgColor = 'bg-secondary/30'
                let dotColor = ''
                if (record) {
                  const cfg = STATUS_CONFIG[record.status]
                  if (record.status === 'on_time') bgColor = 'bg-success/20'
                  else if (record.status === 'late') bgColor = 'bg-warning/20'
                  else if (record.status === 'absent') bgColor = 'bg-destructive/20'
                  else bgColor = 'bg-muted/30'
                  dotColor = cfg?.color || ''
                } else if (isPast) {
                  bgColor = 'bg-secondary/10'
                }

                return (
                  <div
                    key={date}
                    className={`relative rounded-md p-1.5 ${bgColor} ${isToday ? 'ring-1 ring-primary' : ''}`}
                    title={record ? `${STATUS_CONFIG[record.status]?.label || record.status} - ${record.workedMinutes}min trabalhados` : ''}
                  >
                    <div className="text-xs text-foreground">{dayNum}</div>
                    {record && dotColor && (
                      <div className={`mx-auto mt-0.5 h-1.5 w-1.5 rounded-full ${dotColor.replace('text-', 'bg-')}`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${cfg.color.replace('text-', 'bg-')}`} />
                  <span className="text-muted-foreground">{cfg.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Detalhes do mes</h3>
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro neste mes.</p>
            ) : (
              <div className="space-y-1.5">
                {records.sort((a, b) => b.date.localeCompare(a.date)).map(record => {
                  const cfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending
                  const Icon = cfg.icon
                  return (
                    <div key={record.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                      <Icon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {new Date(record.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          </span>
                          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {record.checkIn && (
                            <span>Entrada: {new Date(record.checkIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                          {record.checkOut && (
                            <span>Saida: {new Date(record.checkOut).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                          {record.lateMinutes > 0 && <span className="text-warning">+{record.lateMinutes}min atraso</span>}
                          <span>{Math.floor(record.workedMinutes / 60)}h{record.workedMinutes % 60}min</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
