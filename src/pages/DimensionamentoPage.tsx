import { useState, useMemo, useCallback } from 'react'
import { useApp } from '@/store/AppContext'
import { cn, formatCurrency } from '@/lib/utils'
import {
  Calculator,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  UserPlus,
  UserMinus,
  Clock,
  Target,
  BarChart3,
  FlaskConical,
} from 'lucide-react'

/**
 * Dimensionamento Operacional
 *
 * Output final: para X pedidos/semana, preciso de Y pessoas contratadas,
 * considerando absenteismo, ferias e turnover.
 *
 * Formula:
 * 1. Demanda = pedidos/semana / pedidos por pessoa por hora / horas uteis por dia / dias da semana
 * 2. Headcount necessario = Demanda + margem de absenteismo + margem de ferias/folga
 * 3. Deficit/Superavit = Headcount necessario - ativos atuais
 */

export default function DimensionamentoPage() {
  const { state } = useApp()

  // Input parameters
  const [weeklyOrders, setWeeklyOrders] = useState(3000)
  const [ordersPerPersonHour, setOrdersPerPersonHour] = useState(25)
  const [hoursPerDay, setHoursPerDay] = useState(10) // hours the kitchen operates
  const [daysPerWeek, setDaysPerWeek] = useState(7)
  const [absenteeismRate, setAbsenteeismRate] = useState(10) // %
  const [vacationBuffer, setVacationBuffer] = useState(8) // % of staff on vacation/folga at any time
  const [turnoverRate, setTurnoverRate] = useState(5) // % monthly turnover
  const [minPerSlot, setMinPerSlot] = useState(2) // minimum people at any time

  const activeEmployees = state.employees.filter(e => e.status === 'ativo')
  const onVacation = state.employees.filter(e => e.status === 'ferias')
  const inactive = state.employees.filter(e => e.status === 'inativo')

  // Real data from ponto/productivity
  const realMetrics = useMemo(() => {
    const recentPonto = state.pontoRecords.slice(-100)
    const recentProd = state.productivityRecords.slice(-50)

    const totalWorkedHours = recentPonto.reduce((s, p) => s + p.workedMinutes / 60, 0)
    const totalAbsences = recentPonto.filter(p => p.status === 'absent').length
    const totalRecords = recentPonto.length
    const realAbsenteeism = totalRecords > 0 ? (totalAbsences / totalRecords) * 100 : 0

    const totalOrders = recentProd.reduce((s, r) => s + r.totalOrders, 0)
    const totalProdHours = recentProd.reduce((s, r) => s + r.hoursWorked, 0)
    const realOrdersPerHour = totalProdHours > 0 ? totalOrders / totalProdHours : 0

    return {
      totalWorkedHours,
      realAbsenteeism: Math.round(realAbsenteeism * 10) / 10,
      realOrdersPerHour: Math.round(realOrdersPerHour * 10) / 10,
      hasData: totalRecords > 0,
    }
  }, [state.pontoRecords, state.productivityRecords])

  // Schedule gap analysis
  const scheduleGaps = useMemo(() => {
    const currentSchedule = state.schedules.find(s => s.weekStart === state.currentWeek)
    if (!currentSchedule) return { totalSlots: 0, filledSlots: 0, unfilledSlots: 0, gapRate: 0 }

    let totalSlots = 0
    let filledSlots = 0
    for (const day of currentSchedule.days) {
      for (const slot of day.slots) {
        if (slot.requiredPeople > 0) {
          totalSlots += slot.requiredPeople
          filledSlots += Math.min(slot.assignments.length, slot.requiredPeople)
        }
      }
    }
    return {
      totalSlots,
      filledSlots,
      unfilledSlots: totalSlots - filledSlots,
      gapRate: totalSlots > 0 ? Math.round(((totalSlots - filledSlots) / totalSlots) * 100) : 0,
    }
  }, [state.schedules, state.currentWeek])

  // ── CALCULATION ──
  const calc = useMemo(() => {
    // Base need: how many person-hours per week
    const totalPersonHoursNeeded = weeklyOrders / ordersPerPersonHour

    // FTEs needed (full-time equivalents) at minimum
    const weeklyHoursPerPerson = hoursPerDay * daysPerWeek > 44 ? 44 : hoursPerDay * daysPerWeek
    const baseFTE = totalPersonHoursNeeded / weeklyHoursPerPerson

    // Add buffer for absenteeism
    const withAbsenteeism = baseFTE / (1 - absenteeismRate / 100)

    // Add buffer for vacation/folga
    const withVacation = withAbsenteeism / (1 - vacationBuffer / 100)

    // Ensure minimum per slot coverage
    const minCoverageNeed = minPerSlot * (hoursPerDay) // minimum person-slots per day
    const minFTE = (minCoverageNeed * daysPerWeek) / weeklyHoursPerPerson
    const finalNeed = Math.max(withVacation, minFTE)

    const headcountNeeded = Math.ceil(finalNeed)
    const currentActive = activeEmployees.length
    const deficit = headcountNeeded - currentActive

    // Monthly turnover projection
    const monthlyLoss = Math.ceil(currentActive * (turnoverRate / 100))
    const hiringNeedWithTurnover = Math.max(0, deficit) + monthlyLoss

    // Cost projection
    const avgMonthlyCost = activeEmployees.length > 0
      ? activeEmployees.reduce((s, e) => s + e.monthlyCost, 0) / activeEmployees.length
      : 2000
    const hiringCost = hiringNeedWithTurnover * avgMonthlyCost

    return {
      totalPersonHoursNeeded: Math.round(totalPersonHoursNeeded),
      baseFTE: Math.round(baseFTE * 10) / 10,
      withAbsenteeism: Math.round(withAbsenteeism * 10) / 10,
      withVacation: Math.round(withVacation * 10) / 10,
      headcountNeeded,
      currentActive,
      deficit,
      monthlyLoss,
      hiringNeedWithTurnover,
      avgMonthlyCost: Math.round(avgMonthlyCost),
      hiringCost: Math.round(hiringCost),
      weeklyHoursPerPerson,
    }
  }, [weeklyOrders, ordersPerPersonHour, hoursPerDay, daysPerWeek, absenteeismRate, vacationBuffer, turnoverRate, minPerSlot, activeEmployees])

  const isDeficit = calc.deficit > 0
  const isSurplus = calc.deficit < 0

  // ── SIMULATOR STATE ──
  const [simFaltas, setSimFaltas] = useState(0)
  const [simDemandaPct, setSimDemandaPct] = useState(0)
  const [simTurnoverExtra, setSimTurnoverExtra] = useState(0)

  const simulateScenario = useCallback((faltas: number, demandaPct: number, turnoverExtra: number) => {
    const simWeeklyOrders = Math.round(weeklyOrders * (1 + demandaPct / 100))
    const simActive = Math.max(0, activeEmployees.length - faltas)

    const totalPersonHoursNeeded = simWeeklyOrders / ordersPerPersonHour
    const weeklyHoursPerPerson = hoursPerDay * daysPerWeek > 44 ? 44 : hoursPerDay * daysPerWeek
    const baseFTE = totalPersonHoursNeeded / weeklyHoursPerPerson
    const withAbsenteeism = baseFTE / (1 - absenteeismRate / 100)
    const withVacation = withAbsenteeism / (1 - vacationBuffer / 100)
    const minCoverageNeed = minPerSlot * hoursPerDay
    const minFTE = (minCoverageNeed * daysPerWeek) / weeklyHoursPerPerson
    const finalNeed = Math.max(withVacation, minFTE)

    const headcountNeeded = Math.ceil(finalNeed)
    const deficit = headcountNeeded - simActive

    const simTurnover = turnoverRate + turnoverExtra
    const monthlyLoss = Math.ceil(simActive * (simTurnover / 100))
    const hiringNeedWithTurnover = Math.max(0, deficit) + monthlyLoss

    const avgMonthlyCost = activeEmployees.length > 0
      ? activeEmployees.reduce((s, e) => s + e.monthlyCost, 0) / activeEmployees.length
      : 2000
    const hiringCost = hiringNeedWithTurnover * avgMonthlyCost

    return {
      weeklyOrders: simWeeklyOrders,
      headcountNeeded,
      currentActive: simActive,
      deficit,
      monthlyLoss,
      hiringNeedWithTurnover,
      projectedCost: Math.round(hiringCost),
      isCritical: deficit > 2,
    }
  }, [weeklyOrders, ordersPerPersonHour, hoursPerDay, daysPerWeek, absenteeismRate, vacationBuffer, turnoverRate, minPerSlot, activeEmployees])

  const baseScenario = useMemo(() => simulateScenario(0, 0, 0), [simulateScenario])
  const customScenario = useMemo(() => simulateScenario(simFaltas, simDemandaPct, simTurnoverExtra), [simulateScenario, simFaltas, simDemandaPct, simTurnoverExtra])

  const presets = [
    { label: 'E se 2 faltas hoje?', faltas: 2, demanda: 0, turnover: 0 },
    { label: 'E se demanda +20%?', faltas: 0, demanda: 20, turnover: 0 },
    { label: 'E se demanda -20%?', faltas: 0, demanda: -20, turnover: 0 },
  ] as const

  const [activePreset, setActivePreset] = useState<number | null>(null)

  const displayScenario = activePreset !== null
    ? simulateScenario(presets[activePreset].faltas, presets[activePreset].demanda, presets[activePreset].turnover)
    : customScenario

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Calculator className="h-5 w-5 text-primary" />
          Dimensionamento Operacional
        </h2>
        <p className="text-sm text-muted-foreground">
          Para X pedidos, preciso de Y pessoas — calculado com absenteismo, ferias e turnover
        </p>
      </div>

      {/* ── BIG RESULT ── */}
      <div className={`rounded-2xl border-2 p-5 text-center ${
        isDeficit ? 'border-destructive/40 bg-destructive/5' : isSurplus ? 'border-success/40 bg-success/5' : 'border-primary/40 bg-primary/5'
      }`}>
        <div className="text-sm text-muted-foreground">Para {weeklyOrders.toLocaleString()} pedidos/semana voce precisa de</div>
        <div className={`text-5xl font-black mt-1 ${isDeficit ? 'text-destructive' : isSurplus ? 'text-success' : 'text-primary'}`}>
          {calc.headcountNeeded}
        </div>
        <div className="text-sm text-muted-foreground">pessoas contratadas</div>
        <div className="mt-3 flex items-center justify-center gap-2">
          {isDeficit ? (
            <>
              <UserPlus className="h-5 w-5 text-destructive" />
              <span className="text-base font-bold text-destructive">Precisa contratar {calc.deficit} pessoa(s)</span>
            </>
          ) : isSurplus ? (
            <>
              <UserMinus className="h-5 w-5 text-success" />
              <span className="text-base font-bold text-success">Quadro com {Math.abs(calc.deficit)} pessoa(s) a mais</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 text-primary" />
              <span className="text-base font-bold text-primary">Quadro ideal!</span>
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Atualmente: {calc.currentActive} ativos · {onVacation.length} ferias · {inactive.length} inativos
        </div>
      </div>

      {/* ── PARAMETERS ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Target className="h-4 w-4 text-primary" /> Parametros de Calculo
        </h3>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <ParamInput label="Pedidos/semana" value={weeklyOrders} onChange={setWeeklyOrders} unit="pedidos" />
          <ParamInput label="Pedidos/pessoa/hora" value={ordersPerPersonHour} onChange={setOrdersPerPersonHour} unit="ped/h" />
          <ParamInput label="Horas operacao/dia" value={hoursPerDay} onChange={setHoursPerDay} unit="horas" />
          <ParamInput label="Dias/semana" value={daysPerWeek} onChange={setDaysPerWeek} unit="dias" />
          <ParamInput label="Absenteismo" value={absenteeismRate} onChange={setAbsenteeismRate} unit="%" />
          <ParamInput label="Buffer ferias/folga" value={vacationBuffer} onChange={setVacationBuffer} unit="%" />
          <ParamInput label="Turnover mensal" value={turnoverRate} onChange={setTurnoverRate} unit="%" />
          <ParamInput label="Min. pessoas/slot" value={minPerSlot} onChange={setMinPerSlot} unit="pessoas" />
        </div>

        {realMetrics.hasData && (
          <div className="mt-3 rounded-lg bg-secondary/50 p-2.5 text-xs text-muted-foreground">
            <strong className="text-foreground">Dados reais:</strong>{' '}
            Absenteismo real: <span className="text-primary font-medium">{realMetrics.realAbsenteeism}%</span> ·
            Produtividade real: <span className="text-primary font-medium">{realMetrics.realOrdersPerHour} ped/h</span>
            <button
              onClick={() => {
                if (realMetrics.realAbsenteeism > 0) setAbsenteeismRate(realMetrics.realAbsenteeism)
                if (realMetrics.realOrdersPerHour > 0) setOrdersPerPersonHour(realMetrics.realOrdersPerHour)
              }}
              className="ml-2 text-primary underline"
            >
              Usar dados reais
            </button>
          </div>
        )}
      </div>

      {/* ── BREAKDOWN ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4 text-accent" /> Decomposicao do Calculo
          </h3>
          <div className="space-y-1.5 text-xs">
            <Row label="Pessoa-horas necessarias/semana" value={`${calc.totalPersonHoursNeeded}h`} />
            <Row label={`Jornada por pessoa (${calc.weeklyHoursPerPerson}h/sem)`} value={`${calc.baseFTE} FTEs base`} />
            <Row label={`+ Absenteismo (${absenteeismRate}%)`} value={`${calc.withAbsenteeism} FTEs`} />
            <Row label={`+ Ferias/folga (${vacationBuffer}%)`} value={`${calc.withVacation} FTEs`} />
            <div className="border-t border-border pt-1.5">
              <Row label="Headcount necessario" value={`${calc.headcountNeeded}`} bold />
              <Row label="Quadro atual (ativos)" value={`${calc.currentActive}`} />
              <Row
                label={isDeficit ? 'DEFICIT' : isSurplus ? 'SUPERAVIT' : 'EQUILIBRIO'}
                value={`${Math.abs(calc.deficit)} pessoas`}
                color={isDeficit ? 'text-destructive' : isSurplus ? 'text-success' : 'text-primary'}
                bold
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-warning" /> Projecao de Contratacao
          </h3>
          <div className="space-y-1.5 text-xs">
            <Row label="Deficit atual" value={`${Math.max(0, calc.deficit)} pessoas`} />
            <Row label={`Turnover estimado/mes (${turnoverRate}%)`} value={`${calc.monthlyLoss} saidas`} />
            <div className="border-t border-border pt-1.5">
              <Row label="Necessidade de contratacao" value={`${calc.hiringNeedWithTurnover} pessoas`} bold color="text-primary" />
              <Row label="Custo medio/colaborador" value={`R$${calc.avgMonthlyCost.toLocaleString()}/mes`} />
              <Row label="Investimento mensal estimado" value={`R$${calc.hiringCost.toLocaleString()}/mes`} bold color="text-warning" />
            </div>
          </div>
        </div>
      </div>

      {/* ── SCHEDULE GAP ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock className="h-4 w-4 text-chart-3" /> Gap de Escala (Semana Atual)
        </h3>
        {scheduleGaps.totalSlots === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma escala publicada para esta semana.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary p-2">
                <div className="text-lg font-bold text-foreground">{scheduleGaps.totalSlots}</div>
                <div className="text-[10px] text-muted-foreground">Vagas necessarias</div>
              </div>
              <div className="rounded-lg bg-secondary p-2">
                <div className="text-lg font-bold text-success">{scheduleGaps.filledSlots}</div>
                <div className="text-[10px] text-muted-foreground">Preenchidas</div>
              </div>
              <div className="rounded-lg bg-secondary p-2">
                <div className={`text-lg font-bold ${scheduleGaps.unfilledSlots > 0 ? 'text-destructive' : 'text-success'}`}>
                  {scheduleGaps.unfilledSlots}
                </div>
                <div className="text-[10px] text-muted-foreground">Em aberto</div>
              </div>
            </div>
            {scheduleGaps.unfilledSlots > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="text-foreground">
                  A escala tem <strong>{scheduleGaps.gapRate}%</strong> de vagas sem cobertura.
                  Isso confirma a necessidade de contratacao de pelo menos{' '}
                  <strong>{Math.ceil(scheduleGaps.unfilledSlots / daysPerWeek)} pessoa(s)</strong> para cobrir os horarios.
                </span>
              </div>
            )}
            {scheduleGaps.unfilledSlots === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-xs">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-success font-medium">Escala 100% preenchida!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── EMPLOYEE SUMMARY ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-accent" /> Quadro Atual
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['auxiliar', 'lider', 'supervisor', 'gerente'] as const).map(role => {
            const count = activeEmployees.filter(e => e.role === role).length
            return (
              <div key={role} className="rounded-lg bg-secondary p-2.5 text-center">
                <div className="text-lg font-bold text-foreground">{count}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{role === 'lider' ? 'Lider' : role}</div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
          <span>Total ativos: <strong className="text-foreground">{activeEmployees.length}</strong></span>
          <span>Ferias: <strong className="text-warning">{onVacation.length}</strong></span>
          <span>Inativos: <strong className="text-destructive">{inactive.length}</strong></span>
        </div>
      </div>

      {/* ── SIMULADOR DE CENARIOS ── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FlaskConical className="h-4 w-4 text-chart-3" /> Simulador de Cenarios
        </h3>
        <p className="text-xs text-muted-foreground">
          Crie cenarios hipoteticos para antecipar necessidades de contratacao e custos.
        </p>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2">
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setActivePreset(activePreset === idx ? null : idx)
              }}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                activePreset === idx
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary text-muted-foreground hover:bg-secondary/80'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom scenario form */}
        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="mb-2 text-xs font-medium text-foreground">Cenario personalizado</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">Extra faltas</label>
              <input
                type="number"
                value={simFaltas}
                onChange={e => { setSimFaltas(parseInt(e.target.value) || 0); setActivePreset(null) }}
                min={0}
                className="w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm text-foreground text-right"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">Variacao demanda %</label>
              <input
                type="number"
                value={simDemandaPct}
                onChange={e => { setSimDemandaPct(parseFloat(e.target.value) || 0); setActivePreset(null) }}
                className="w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm text-foreground text-right"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">Turnover extra %</label>
              <input
                type="number"
                value={simTurnoverExtra}
                onChange={e => { setSimTurnoverExtra(parseFloat(e.target.value) || 0); setActivePreset(null) }}
                min={0}
                className="w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm text-foreground text-right"
              />
            </div>
          </div>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Base scenario card */}
          <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cenario Base</div>
            <div className="space-y-1.5 text-xs">
              <Row label="Quadro necessario" value={`${baseScenario.headcountNeeded}`} bold />
              <Row label="Quadro atual" value={`${baseScenario.currentActive}`} />
              <Row
                label={baseScenario.deficit > 0 ? 'Deficit' : 'Excedente'}
                value={`${Math.abs(baseScenario.deficit)} pessoas`}
                color={baseScenario.deficit > 0 ? 'text-destructive' : 'text-success'}
                bold
              />
              <Row label="Custo projetado" value={formatCurrency(baseScenario.projectedCost)} />
            </div>
          </div>

          {/* Simulated scenario card */}
          <div className={cn(
            'rounded-xl border-2 p-4 space-y-2',
            displayScenario.isCritical
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-success/40 bg-success/5'
          )}>
            <div className={cn(
              'text-xs font-semibold uppercase tracking-wide',
              displayScenario.isCritical ? 'text-destructive' : 'text-success'
            )}>
              Cenario Simulado
            </div>
            <div className="space-y-1.5 text-xs">
              <Row label="Quadro necessario" value={`${displayScenario.headcountNeeded}`} bold />
              <Row label="Quadro atual" value={`${displayScenario.currentActive}`} />
              <Row
                label={displayScenario.deficit > 0 ? 'Deficit' : 'Excedente'}
                value={`${Math.abs(displayScenario.deficit)} pessoas`}
                color={displayScenario.deficit > 0 ? 'text-destructive' : 'text-success'}
                bold
              />
              <Row label="Custo projetado" value={formatCurrency(displayScenario.projectedCost)} />
            </div>
            <div className={cn(
              'mt-2 flex items-center gap-1.5 rounded-lg p-2 text-xs font-medium',
              displayScenario.isCritical ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            )}>
              {displayScenario.isCritical ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Cenario critico — deficit elevado
                </>
              ) : (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Cenario gerenciavel
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ParamInput({ label, value, onChange, unit }: {
  label: string; value: number; onChange: (v: number) => void; unit: string
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-sm text-foreground text-right"
        />
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{unit}</span>
      </div>
    </div>
  )
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-muted-foreground ${bold ? 'font-medium text-foreground' : ''}`}>{label}</span>
      <span className={`font-mono ${color || 'text-foreground'} ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  )
}
