import { useState, useMemo } from 'react'
import { FileText, Printer, DollarSign, Calendar } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useApp } from '@/store/AppContext'
import { formatCurrency } from '@/lib/utils'
import { calculateConvocationPayroll, calculateShiftMinutes } from '@/services/payrollCalculator'
import type { ConvocationPayroll } from '@/services/payrollCalculator'

export default function ReciboPagamentoPage() {
  const { state } = useApp()
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [weekStart, setWeekStart] = useState(state.currentWeek)

  const activeEmployees = useMemo(
    () => state.employees.filter(e => e.status === 'ativo' && e.hourlyRate > 0),
    [state.employees],
  )

  // Build payroll from schedule data
  const payrolls = useMemo<ConvocationPayroll[]>(() => {
    if (!selectedEmployee) return []

    const emp = state.employees.find(e => e.id === selectedEmployee)
    if (!emp) return []

    const schedule = state.schedules.find(s => s.weekStart === weekStart)
    if (!schedule) return []

    const results: ConvocationPayroll[] = []

    for (const day of schedule.days) {
      // Find all hours where this employee is assigned
      const assignedHours: string[] = []
      for (const slot of day.slots) {
        const assigned = slot.assignments.some(a => a.employeeId === selectedEmployee)
        if (assigned) {
          assignedHours.push(slot.hour)
        }
      }

      if (assignedHours.length === 0) continue

      // Group consecutive hours into shifts
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
        results.push(
          calculateConvocationPayroll(
            emp,
            mins,
            day.date,
            shift.start,
            shift.end,
          ),
        )
      }
    }

    return results
  }, [selectedEmployee, weekStart, state.employees, state.schedules])

  const totals = useMemo(() => {
    return payrolls.reduce(
      (acc, p) => ({
        workedHours: acc.workedHours + p.workedHours,
        salarioBase: acc.salarioBase + p.salarioBase,
        dsr: acc.dsr + p.dsr,
        ferias: acc.ferias + p.ferias,
        tercoFerias: acc.tercoFerias + p.tercoFerias,
        decimoTerceiro: acc.decimoTerceiro + p.decimoTerceiro,
        totalBruto: acc.totalBruto + p.totalBruto,
        inssEmpregado: acc.inssEmpregado + p.inssEmpregado,
        irrf: acc.irrf + p.irrf,
        totalDescontos: acc.totalDescontos + p.totalDescontos,
        liquidoColaborador: acc.liquidoColaborador + p.liquidoColaborador,
        fgts: acc.fgts + p.fgts,
        inssPatronal: acc.inssPatronal + p.inssPatronal,
        custoTotalEmpregador: acc.custoTotalEmpregador + p.custoTotalEmpregador,
      }),
      {
        workedHours: 0,
        salarioBase: 0,
        dsr: 0,
        ferias: 0,
        tercoFerias: 0,
        decimoTerceiro: 0,
        totalBruto: 0,
        inssEmpregado: 0,
        irrf: 0,
        totalDescontos: 0,
        liquidoColaborador: 0,
        fgts: 0,
        inssPatronal: 0,
        custoTotalEmpregador: 0,
      },
    )
  }, [payrolls])

  function handlePrint() {
    window.print()
  }

  const emp = state.employees.find(e => e.id === selectedEmployee)

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      {/* Header — hidden when printing */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Recibo de Pagamento
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Calculo CLT intermitente por convocacao
          </p>
        </div>
        {payrolls.length > 0 && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 print:hidden"
          >
            <Printer className="h-4 w-4" />
            Imprimir Recibo
          </button>
        )}
      </div>

      {/* Selectors */}
      <div className="flex flex-col gap-3 sm:flex-row print:hidden">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Colaborador</label>
          <select
            value={selectedEmployee}
            onChange={e => setSelectedEmployee(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground"
          >
            <option value="">Selecione...</option>
            {activeEmployees.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({formatCurrency(e.hourlyRate)}/h)</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-48">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Semana</label>
          <input
            type="date"
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground"
          />
        </div>
      </div>

      {!selectedEmployee && (
        <Card variant="glass">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <DollarSign className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Selecione um colaborador para gerar o recibo.</p>
          </div>
        </Card>
      )}

      {selectedEmployee && payrolls.length === 0 && (
        <Card variant="glass">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma escala encontrada para esta semana.</p>
          </div>
        </Card>
      )}

      {payrolls.length > 0 && emp && (
        <div className="space-y-4" id="recibo-print">
          {/* Header for print */}
          <div className="hidden print:block text-center mb-4">
            <h1 className="text-xl font-bold">ORION - Recibo de Pagamento Intermitente</h1>
            <p className="text-sm">Semana: {weekStart}</p>
          </div>

          {/* Employee info */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">{emp.name}</h3>
                <p className="text-sm text-muted-foreground">Valor/Hora: {formatCurrency(emp.hourlyRate)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Semana</p>
                <p className="font-medium text-foreground">{weekStart}</p>
              </div>
            </div>
          </Card>

          {/* Convocations detail */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Turnos da Semana
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Horario</th>
                    <th className="px-2 py-2 text-right">Horas</th>
                    <th className="px-2 py-2 text-right">Base</th>
                    <th className="px-2 py-2 text-right">Bruto</th>
                    <th className="px-2 py-2 text-right">INSS</th>
                    <th className="px-2 py-2 text-right">Liquido</th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.map((p, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-2 py-2 text-foreground">{p.shiftDate}</td>
                      <td className="px-2 py-2 text-foreground">{p.shiftStart}-{p.shiftEnd}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{p.workedHours}h</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{formatCurrency(p.salarioBase)}</td>
                      <td className="px-2 py-2 text-right text-foreground">{formatCurrency(p.totalBruto)}</td>
                      <td className="px-2 py-2 text-right text-destructive">{formatCurrency(p.inssEmpregado)}</td>
                      <td className="px-2 py-2 text-right font-medium text-foreground">{formatCurrency(p.liquidoColaborador)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Proventos */}
            <Card>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-success">Proventos</h3>
              <div className="space-y-2 text-sm">
                <Row label="Salario Base" value={totals.salarioBase} />
                <Row label="DSR (1/6)" value={totals.dsr} />
                <Row label="Ferias Proporcionais" value={totals.ferias} />
                <Row label="1/3 Ferias" value={totals.tercoFerias} />
                <Row label="13o Proporcional" value={totals.decimoTerceiro} />
                <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground">
                  <span>Total Bruto</span>
                  <span>{formatCurrency(totals.totalBruto)}</span>
                </div>
              </div>
            </Card>

            {/* Descontos */}
            <Card>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-destructive">Descontos</h3>
              <div className="space-y-2 text-sm">
                <Row label="INSS Empregado" value={totals.inssEmpregado} negative />
                <Row label="IRRF" value={totals.irrf} negative />
                <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground">
                  <span>Total Descontos</span>
                  <span className="text-destructive">{formatCurrency(totals.totalDescontos)}</span>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-primary/10 p-3 flex justify-between items-center">
                <span className="font-bold text-foreground">Liquido a Receber</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(totals.liquidoColaborador)}</span>
              </div>
            </Card>
          </div>

          {/* Custo empregador */}
          <Card variant="glass">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Custo Empregador
            </h3>
            <div className="space-y-2 text-sm">
              <Row label="Total Bruto" value={totals.totalBruto} />
              <Row label="FGTS (8%)" value={totals.fgts} />
              <Row label="INSS Patronal (20%)" value={totals.inssPatronal} />
              <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground">
                <span>Custo Total Empregador</span>
                <span className="text-warning">{formatCurrency(totals.custoTotalEmpregador)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          .hidden.print\\:block { display: block !important; }
          nav, aside, header, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? 'text-destructive' : 'text-foreground'}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}
