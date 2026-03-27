import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Clock,
  Fingerprint,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Users,
  Zap,
  DollarSign,
  Target,
  TrendingUp,
  LogOut,
  ChevronRight,
  UserCog,
  Calculator,
  Star,
  FileDown,
} from 'lucide-react'
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

function NavCard({ to, icon: Icon, label, description, badge }: {
  to: string; icon: typeof Clock; label: string; description: string; badge?: string
}) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-4 transition-all hover:ring-1 hover:ring-primary/30">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {badge && <Badge variant="warning" size="sm">{badge}</Badge>}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Card>
    </Link>
  )
}

export default function HomePage() {
  const { state, dispatch } = useApp()
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

  // ── Colaborador metrics ──
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

  const myWeekProdRecords = useMemo(() => {
    return state.productivityRecords.filter((r) => r.employeeId === loggedEmployeeId && r.weekStart === weekStart)
  }, [state.productivityRecords, loggedEmployeeId, weekStart])

  // ── Lider/Gerente metrics ──
  const todayStats = useMemo(() => {
    if (!todaySchedule) return { scheduled: 0, checkedIn: 0, absent: 0, late: 0 }
    const scheduled = new Set<string>()
    todaySchedule.slots.forEach((s) => s.assignments.forEach((a) => scheduled.add(a.employeeId)))

    const checkedIn = state.pontoRecords.filter(
      (p) => p.date === today && (p.status === 'on_time' || p.status === 'late'),
    ).length
    const absent = state.pontoRecords.filter((p) => p.date === today && p.status === 'absent').length
    const late = state.pontoRecords.filter((p) => p.date === today && p.status === 'late').length

    return { scheduled: scheduled.size, checkedIn, absent, late }
  }, [todaySchedule, state.pontoRecords, today])

  const weekProductivity = useMemo(() => {
    const records = state.productivityRecords.filter((r) => r.weekStart === weekStart)
    if (records.length === 0) return null
    return {
      totalOrders: records.reduce((s, r) => s + r.totalOrders, 0),
      totalErrors: records.reduce((s, r) => s + r.totalErrors, 0),
      totalErrorCost: records.reduce((s, r) => s + r.errorCost, 0),
      avgSla: records.reduce((s, r) => s + r.slaCompliance, 0) / records.length,
    }
  }, [state.productivityRecords, weekStart])

  const handleLogout = () => {
    localStorage.removeItem('orion_logged_employee')
    dispatch({ type: 'SET_CURRENT_USER', payload: { name: '', role: 'colaborador' } })
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      {/* Header with greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">
            {greeting}, {currentUser.name || 'Usuario'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* COLABORADOR HOME                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {currentUser.role === 'colaborador' && (
        <>
          {/* Today's shift */}
          {myShiftToday ? (
            <Card className={cn('border-2', myPontoToday?.checkIn ? 'border-success/30 bg-success/5' : 'border-primary/30 bg-primary/5')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Seu turno hoje</p>
                  <p className="text-2xl font-black text-foreground">{myShiftToday.start} — {myShiftToday.end}</p>
                  <p className="text-sm text-muted-foreground">{myShiftToday.hours}h de trabalho</p>
                </div>
                {myPontoToday?.checkIn ? (
                  <div className="text-right">
                    <Badge variant="success" size="md"><CheckCircle className="mr-1 h-3.5 w-3.5" /> Check-in feito</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(myPontoToday.checkIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ) : (
                  <Link
                    to="/checkin"
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
                  >
                    <Fingerprint className="h-5 w-5" />
                    Check-in
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

          {/* Quick stats */}
          {myWeekProdRecords.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="text-center !p-3">
                <p className="text-[10px] text-muted-foreground">Pedidos</p>
                <p className="text-xl font-bold text-foreground">
                  {myWeekProdRecords.reduce((s, r) => s + r.totalOrders, 0)}
                </p>
              </Card>
              <Card className="text-center !p-3">
                <p className="text-[10px] text-muted-foreground">Erros</p>
                <p className={cn('text-xl font-bold', myWeekProdRecords.reduce((s, r) => s + r.totalErrors, 0) === 0 ? 'text-success' : 'text-destructive')}>
                  {myWeekProdRecords.reduce((s, r) => s + r.totalErrors, 0)}
                </p>
              </Card>
              <Card className="text-center !p-3">
                <p className="text-[10px] text-muted-foreground">SLA</p>
                <p className="text-xl font-bold text-foreground">
                  {(myWeekProdRecords.reduce((s, r) => s + r.slaCompliance, 0) / myWeekProdRecords.length).toFixed(0)}%
                </p>
              </Card>
            </div>
          )}

          {/* Nav cards */}
          <div className="space-y-2">
            <NavCard to="/minha-area" icon={CalendarDays} label="Minha Escala" description="Ver escala, confirmar turnos, ver ganhos" />
            <NavCard to="/produtividade" icon={Zap} label="Minha Produtividade" description="Erros, SLA, metas e premios" />
            <NavCard to="/checkin" icon={MapPin} label="Check-in / Check-out" description="Registrar presenca por GPS" />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SUPERVISOR / LIDER HOME                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {currentUser.role === 'supervisor' && (
        <>
          {/* Today overview */}
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

          {/* Week productivity */}
          {weekProductivity && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produtividade da Semana</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{weekProductivity.totalOrders}</p>
                  <p className="text-[10px] text-muted-foreground">Pedidos</p>
                </div>
                <div className="text-center">
                  <p className={cn('text-2xl font-bold', weekProductivity.totalErrors === 0 ? 'text-success' : 'text-destructive')}>
                    {weekProductivity.totalErrors}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Erros</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(weekProductivity.totalErrorCost)}</p>
                  <p className="text-[10px] text-muted-foreground">Reembolso</p>
                </div>
                <div className="text-center">
                  <p className={cn('text-2xl font-bold', weekProductivity.avgSla >= 95 ? 'text-success' : 'text-warning')}>
                    {weekProductivity.avgSla.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">SLA</p>
                </div>
              </div>
            </Card>
          )}

          {/* Nav cards */}
          <div className="space-y-2">
            <NavCard to="/escala" icon={CalendarDays} label="Escala Semanal" description="Montar e publicar escala" />
            <NavCard to="/ponto" icon={Fingerprint} label="Ponto do Dia" description="Ver check-ins, atrasos e faltas"
              badge={todayStats.scheduled - todayStats.checkedIn > 0 ? `${todayStats.scheduled - todayStats.checkedIn} pendentes` : undefined}
            />
            <NavCard to="/produtividade" icon={Zap} label="Produtividade" description="Lancar dados, metas e premios" />
            <NavCard to="/ranking" icon={TrendingUp} label="Ranking" description="Classificacao dos colaboradores" />
            <NavCard to="/colaboradores" icon={Users} label="Colaboradores" description="Cadastro da equipe" />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* GERENTE HOME                                               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {(currentUser.role === 'gerente' || currentUser.role === 'admin') && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="text-center !p-3">
              <Users className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-1 text-2xl font-bold text-foreground">
                {state.employees.filter((e) => e.status === 'ativo').length}
              </p>
              <p className="text-[10px] text-muted-foreground">Ativos</p>
            </Card>
            <Card className="text-center !p-3">
              <CalendarDays className="mx-auto h-5 w-5 text-accent" />
              <p className="mt-1 text-2xl font-bold text-foreground">
                {state.schedules.filter((s) => s.published).length}
              </p>
              <p className="text-[10px] text-muted-foreground">Escalas pub.</p>
            </Card>
            {weekProductivity ? (
              <>
                <Card className="text-center !p-3">
                  <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
                  <p className="mt-1 text-2xl font-bold text-destructive">{formatCurrency(weekProductivity.totalErrorCost)}</p>
                  <p className="text-[10px] text-muted-foreground">Reembolso semana</p>
                </Card>
                <Card className="text-center !p-3">
                  <Target className="mx-auto h-5 w-5 text-success" />
                  <p className="mt-1 text-2xl font-bold text-foreground">{weekProductivity.avgSla.toFixed(0)}%</p>
                  <p className="text-[10px] text-muted-foreground">SLA semana</p>
                </Card>
              </>
            ) : (
              <>
                <Card className="text-center !p-3">
                  <DollarSign className="mx-auto h-5 w-5 text-warning" />
                  <p className="mt-1 text-lg font-bold text-muted-foreground">-</p>
                  <p className="text-[10px] text-muted-foreground">Reembolso</p>
                </Card>
                <Card className="text-center !p-3">
                  <Target className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-1 text-lg font-bold text-muted-foreground">-</p>
                  <p className="text-[10px] text-muted-foreground">SLA</p>
                </Card>
              </>
            )}
          </div>

          {/* Today's operations */}
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

          {/* All nav */}
          <div className="space-y-2">
            <NavCard to="/dph" icon={TrendingUp} label="Calculo DPH" description="Demanda por hora e projecao" />
            <NavCard to="/escala" icon={CalendarDays} label="Escala" description="Montar e publicar escala semanal" />
            <NavCard to="/ponto" icon={Fingerprint} label="Ponto" description="Controle de presenca e atrasos" />
            <NavCard to="/produtividade" icon={Zap} label="Produtividade" description="Erros, SLA, metas e premios" />
            <NavCard to="/saldo" icon={DollarSign} label="Saldo de Horas" description="Resumo para pagamento" />
            <NavCard to="/kpis" icon={Target} label="KPIs" description="Indicadores da operacao" />
          </div>
        </>
      )}

      {/* ── RH VIEW ── */}
      {currentUser.role === 'rh' && (
        <>
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

          <div className="space-y-2">
            <NavCard to="/rh" icon={UserCog} label="Painel RH" description="Visao completa de indicadores de pessoas" />
            <NavCard to="/dimensionamento" icon={Calculator} label="Dimensionamento" description="Calcular necessidade de contratacao" />
            <NavCard to="/colaboradores" icon={Users} label="Colaboradores" description="Cadastro e gestao do quadro" />
            <NavCard to="/feedback" icon={Star} label="Avaliacoes" description="Avaliacoes semanais dos colaboradores" />
            <NavCard to="/historico-presenca" icon={Clock} label="Historico Presenca" description="Timeline de presenca e faltas" />
            <NavCard to="/banco-horas" icon={DollarSign} label="Banco de Horas" description="Saldo de extras e deficit" />
            <NavCard to="/relatorios" icon={FileDown} label="Relatorios" description="Exportar dados em CSV" />
          </div>
        </>
      )}
    </div>
  )
}
