import { useMemo, useState } from 'react'
import { DollarSign, Clock, CheckCircle, XCircle, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { useApp } from '@/store/AppContext'
import { formatCurrency } from '@/lib/utils'
import { calculateConvocationPayroll, calculateShiftMinutes } from '@/services/payrollCalculator'

const ROLE_LABELS: Record<string, string> = {
  auxiliar: 'Auxiliar',
  lider: 'Lider',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
}

interface EmployeePayroll {
  id: string
  name: string
  role: string
  hourlyRate: number
  scheduledHours: number
  workedHours: number
  attendance: number
  absences: number
  totalBruto: number
  liquidoColaborador: number
  custoEmpregador: number
  inssEmpregado: number
  fgts: number
  dayDetails: { date: string; dayLabel: string; scheduledHours: number; workedHours: number; status: string }[]
}

const DAY_LABELS: Record<number, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sab',
}

export default function SaldoPage() {
  const { state } = useApp()
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'hours' | 'pay' | 'attendance'>('name')

  const payrollData: EmployeePayroll[] = useMemo(() => {
    const schedule = state.schedules
      .filter((s) => s.published)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0]
      ?? state.schedules[0]

    return state.employees
      .filter((e) => e.status === 'ativo')
      .map((emp) => {
        let scheduledHours = 0
        let workedHours = 0
        let absences = 0
        let totalBruto = 0
        let liquidoColaborador = 0
        let custoEmpregador = 0
        let inssEmpregado = 0
        let fgts = 0
        const dayDetails: EmployeePayroll['dayDetails'] = []

        if (schedule) {
          for (const day of schedule.days) {
            const d = new Date(day.date + 'T00:00:00')
            const dayLabel = `${DAY_LABELS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

            let dayScheduled = 0
            let dayWorked = 0
            let dayStatus = 'sem escala'

            // Find assigned hours and group into shifts
            const assignedHours: string[] = []
            for (const slot of day.slots) {
              const assignment = slot.assignments.find((a) => a.employeeId === emp.id)
              if (assignment) {
                dayScheduled++
                assignedHours.push(slot.hour)
                if (assignment.status === 'present' || assignment.status === 'confirmed' || assignment.status === 'pending') {
                  dayWorked++
                }
              }
            }

            // Calculate CLT payroll for grouped shifts
            if (assignedHours.length > 0 && emp.hourlyRate > 0) {
              const sorted = assignedHours.sort()
              let shiftStart: string | null = null
              let prevEnd: string | null = null
              const shifts: { start: string; end: string }[] = []

              for (const hourRange of sorted) {
                const [start, end] = hourRange.split('-')
                if (shiftStart === null) {
                  shiftStart = start
                  prevEnd = end
                } else if (start === prevEnd) {
                  prevEnd = end
                } else {
                  shifts.push({ start: shiftStart, end: prevEnd! })
                  shiftStart = start
                  prevEnd = end
                }
              }
              if (shiftStart !== null) {
                shifts.push({ start: shiftStart, end: prevEnd! })
              }

              for (const shift of shifts) {
                const mins = calculateShiftMinutes(shift.start, shift.end)
                const payroll = calculateConvocationPayroll(emp, mins, day.date, shift.start, shift.end)
                totalBruto += payroll.totalBruto
                liquidoColaborador += payroll.liquidoColaborador
                custoEmpregador += payroll.custoTotalEmpregador
                inssEmpregado += payroll.inssEmpregado
                fgts += payroll.fgts
              }
            }

            scheduledHours += dayScheduled
            workedHours += dayWorked
            if (dayScheduled > 0 && dayWorked === 0) absences++

            if (dayScheduled > 0) {
              dayStatus = dayWorked === dayScheduled ? 'presente' : dayWorked > 0 ? 'parcial' : 'ausente'
            }

            dayDetails.push({ date: day.date, dayLabel, scheduledHours: dayScheduled, workedHours: dayWorked, status: dayStatus })
          }
        }

        const attendance = scheduledHours > 0 ? workedHours / scheduledHours : 0

        return {
          id: emp.id, name: emp.name, role: emp.role, hourlyRate: emp.hourlyRate,
          scheduledHours, workedHours, attendance, absences,
          totalBruto, liquidoColaborador, custoEmpregador, inssEmpregado, fgts,
          dayDetails,
        }
      })
  }, [state.employees, state.schedules])

  const sortedPayroll = useMemo(() => {
    const sorted = [...payrollData]
    switch (sortBy) {
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'hours': sorted.sort((a, b) => b.workedHours - a.workedHours); break
      case 'pay': sorted.sort((a, b) => b.liquidoColaborador - a.liquidoColaborador); break
      case 'attendance': sorted.sort((a, b) => b.attendance - a.attendance); break
    }
    return sorted
  }, [payrollData, sortBy])

  const totals = useMemo(() => {
    const totalBruto = payrollData.reduce((s, e) => s + e.totalBruto, 0)
    const totalLiquido = payrollData.reduce((s, e) => s + e.liquidoColaborador, 0)
    const totalCusto = payrollData.reduce((s, e) => s + e.custoEmpregador, 0)
    const totalScheduled = payrollData.reduce((s, e) => s + e.scheduledHours, 0)
    const totalWorked = payrollData.reduce((s, e) => s + e.workedHours, 0)
    const avgAttendance = payrollData.length > 0
      ? payrollData.reduce((s, e) => s + e.attendance, 0) / payrollData.length
      : 0
    const totalAbsences = payrollData.reduce((s, e) => s + e.absences, 0)
    return { totalBruto, totalLiquido, totalCusto, totalScheduled, totalWorked, avgAttendance, totalAbsences }
  }, [payrollData])

  const hasScheduleData = payrollData.some((e) => e.scheduledHours > 0)

  function exportCSV() {
    const header = 'Nome,Cargo,Valor/Hora,Horas Escaladas,Horas Trabalhadas,Assiduidade,Bruto,INSS,Liquido,FGTS,Custo Empregador\n'
    const rows = sortedPayroll.map((e) =>
      `${e.name},${ROLE_LABELS[e.role] ?? e.role},${e.hourlyRate.toFixed(2)},${e.scheduledHours},${e.workedHours},${Math.round(e.attendance * 100)}%,${e.totalBruto.toFixed(2)},${e.inssEmpregado.toFixed(2)},${e.liquidoColaborador.toFixed(2)},${e.fgts.toFixed(2)},${e.custoEmpregador.toFixed(2)}`
    ).join('\n')
    const csv = header + rows

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `saldo-horas-clt-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Saldo de Horas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Calculo CLT intermitente - Pagamento quarta-feira
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      {!hasScheduleData && (
        <Card variant="glass">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nenhuma escala lancada ainda. Monte e publique uma escala para ver o saldo aqui.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Liquido Total" value={Number(totals.totalLiquido.toFixed(0))} unit="R$" icon={DollarSign} trend="stable" subtitle={formatCurrency(totals.totalLiquido)} />
        <MetricCard label="Custo Empregador" value={Number(totals.totalCusto.toFixed(0))} unit="R$" icon={DollarSign} trend="stable" subtitle={formatCurrency(totals.totalCusto)} />
        <MetricCard label="Assiduidade Media" value={Number((totals.avgAttendance * 100).toFixed(1))} unit="%" icon={CheckCircle} trend={totals.avgAttendance >= 0.95 ? 'up' : 'down'} subtitle="meta 95%" />
        <MetricCard label="Ausencias" value={totals.totalAbsences} unit="dias" icon={XCircle} trend={totals.totalAbsences === 0 ? 'up' : 'down'} subtitle="dias com falta total" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Ordenar por:</span>
        {(['name', 'hours', 'pay', 'attendance'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              sortBy === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {{ name: 'Nome', hours: 'Horas', pay: 'Valor', attendance: 'Assiduidade' }[key]}
          </button>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">Cargo</th>
                <th className="px-3 py-2.5 text-right">Valor/Hora</th>
                <th className="px-3 py-2.5 text-right">Horas</th>
                <th className="px-3 py-2.5">Assiduidade</th>
                <th className="px-3 py-2.5 text-right">Bruto</th>
                <th className="px-3 py-2.5 text-right">Liquido</th>
                <th className="px-3 py-2.5 text-right">Custo Emp.</th>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {sortedPayroll.map((e, idx) => {
                const pct = Math.round(e.attendance * 100)
                const isExpanded = expandedEmployee === e.id
                return (
                  <>
                    <tr key={e.id}
                      onClick={() => setExpandedEmployee(isExpanded ? null : e.id)}
                      className={`cursor-pointer transition-colors hover:bg-muted/20 ${
                        idx % 2 === 0 ? 'border-b border-border/50' : 'border-b border-border/50 bg-muted/10'
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground">{e.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={e.role === 'gerente' ? 'default' : 'muted'} size="sm">
                          {ROLE_LABELS[e.role] ?? e.role}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(e.hourlyRate)}</td>
                      <td className="px-3 py-2.5 text-right text-foreground">{e.workedHours}h</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                backgroundColor: pct >= 95 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#ef4444',
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(e.totalBruto)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatCurrency(e.liquidoColaborador)}</td>
                      <td className="px-3 py-2.5 text-right text-warning">{formatCurrency(e.custoEmpregador)}</td>
                      <td className="px-3 py-2.5">
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-border/50">
                        <td colSpan={9} className="bg-secondary/30 px-6 py-3">
                          <div className="grid grid-cols-7 gap-2">
                            {e.dayDetails.map((day) => (
                              <div
                                key={day.date}
                                className={`rounded-lg p-2 text-center text-xs ${
                                  day.status === 'presente' ? 'bg-success/10 text-success' :
                                  day.status === 'parcial' ? 'bg-warning/10 text-warning' :
                                  day.status === 'ausente' ? 'bg-destructive/10 text-destructive' :
                                  'bg-muted/30 text-muted-foreground'
                                }`}
                              >
                                <div className="font-medium">{day.dayLabel}</div>
                                <div className="mt-1">
                                  {day.scheduledHours > 0 ? `${day.workedHours}/${day.scheduledHours}h` : '--'}
                                </div>
                                <div className="mt-0.5 text-[10px] capitalize">{day.status}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between border-t border-border pt-4 gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            Total da Semana ({payrollData.filter((e) => e.scheduledHours > 0).length} colaboradores)
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Liquido: <span className="font-bold text-primary">{formatCurrency(totals.totalLiquido)}</span></span>
            <span className="text-sm text-muted-foreground">Custo: <span className="font-bold text-warning">{formatCurrency(totals.totalCusto)}</span></span>
          </div>
        </div>
      </Card>
    </div>
  )
}
