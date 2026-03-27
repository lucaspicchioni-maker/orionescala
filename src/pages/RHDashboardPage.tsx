import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import {
  Users,
  UserPlus,
  UserMinus,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Star,
  Calendar,
  Briefcase,
  Activity,
} from 'lucide-react'

export default function RHDashboardPage() {
  const { state } = useApp()
  const navigate = useNavigate()

  const activeEmployees = state.employees.filter(e => e.status === 'ativo')
  const onVacation = state.employees.filter(e => e.status === 'ferias')
  // Ponto stats (last 30 days)
  const pontoStats = useMemo(() => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recent = state.pontoRecords.filter(p => new Date(p.date) >= thirtyDaysAgo)

    const totalRecords = recent.length
    const absences = recent.filter(p => p.status === 'absent').length
    const lates = recent.filter(p => p.lateMinutes > 5).length
    const totalWorked = recent.reduce((s, p) => s + p.workedMinutes, 0)

    // Per employee stats
    const empStats: Record<string, { absences: number; lates: number; worked: number; days: number }> = {}
    recent.forEach(p => {
      if (!empStats[p.employeeId]) empStats[p.employeeId] = { absences: 0, lates: 0, worked: 0, days: 0 }
      empStats[p.employeeId].days++
      if (p.status === 'absent') empStats[p.employeeId].absences++
      if (p.lateMinutes > 5) empStats[p.employeeId].lates++
      empStats[p.employeeId].worked += p.workedMinutes
    })

    // Top absentees
    const topAbsentees = Object.entries(empStats)
      .filter(([, s]) => s.absences > 0)
      .sort((a, b) => b[1].absences - a[1].absences)
      .slice(0, 5)

    // Top late
    const topLate = Object.entries(empStats)
      .filter(([, s]) => s.lates > 0)
      .sort((a, b) => b[1].lates - a[1].lates)
      .slice(0, 5)

    return {
      totalRecords,
      absences,
      lates,
      totalWorked,
      absenteeismRate: totalRecords > 0 ? Math.round((absences / totalRecords) * 100 * 10) / 10 : 0,
      lateRate: totalRecords > 0 ? Math.round((lates / totalRecords) * 100 * 10) / 10 : 0,
      topAbsentees,
      topLate,
    }
  }, [state.pontoRecords])

  // Feedback averages
  const feedbackStats = useMemo(() => {
    if (state.feedbacks.length === 0) return { avgScore: 0, count: 0 }
    let total = 0
    state.feedbacks.forEach(f => {
      total += (f.scores.proatividade + f.scores.trabalhoEquipe + f.scores.comunicacao + f.scores.qualidade + f.scores.pontualidade) / 5
    })
    return { avgScore: Math.round(total / state.feedbacks.length * 10) / 10, count: state.feedbacks.length }
  }, [state.feedbacks])

  // Schedule gaps
  const scheduleGap = useMemo(() => {
    const sched = state.schedules.find(s => s.weekStart === state.currentWeek)
    if (!sched) return 0
    let unfilled = 0
    for (const day of sched.days) {
      for (const slot of day.slots) {
        if (slot.requiredPeople > slot.assignments.length) {
          unfilled += (slot.requiredPeople - slot.assignments.length)
        }
      }
    }
    return unfilled
  }, [state.schedules, state.currentWeek])

  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    state.employees.forEach(e => { m[e.id] = e.nickname || e.name })
    return m
  }, [state.employees])

  // Contract type distribution
  const contractDist = useMemo(() => {
    const dist: Record<string, number> = { clt: 0, pj: 0, estagiario: 0, temporario: 0, indefinido: 0 }
    activeEmployees.forEach(e => {
      dist[e.contractType || 'indefinido']++
    })
    return dist
  }, [activeEmployees])

  function NavCard({ icon: Icon, label, value, sub, color, to }: {
    icon: typeof Users; label: string; value: string | number; sub: string; color: string; to: string
  }) {
    return (
      <button onClick={() => navigate(to)} className="rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/30 active:scale-[0.98]">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </button>
    )
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground">Painel RH</h2>
        <p className="text-sm text-muted-foreground">Visao geral do quadro de colaboradores e indicadores de pessoas</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <NavCard icon={Users} label="Ativos" value={activeEmployees.length} sub={`${onVacation.length} ferias`} color="text-primary" to="/colaboradores" />
        <NavCard icon={Calendar} label="Gap Escala" value={scheduleGap} sub="vagas abertas" color={scheduleGap > 0 ? 'text-destructive' : 'text-success'} to="/dimensionamento" />
        <NavCard icon={AlertTriangle} label="Absenteismo" value={`${pontoStats.absenteeismRate}%`} sub="ultimos 30 dias" color={pontoStats.absenteeismRate > 10 ? 'text-destructive' : 'text-success'} to="/historico-presenca" />
        <NavCard icon={Clock} label="Atrasos" value={`${pontoStats.lateRate}%`} sub="ultimos 30 dias" color={pontoStats.lateRate > 15 ? 'text-destructive' : 'text-success'} to="/ponto" />
        <NavCard icon={Star} label="Avaliacao Media" value={feedbackStats.avgScore || '-'} sub={`${feedbackStats.count} avaliacoes`} color="text-primary" to="/feedback" />
        <NavCard icon={Activity} label="Horas Trabalhadas" value={`${Math.round(pontoStats.totalWorked / 60)}h`} sub="ultimos 30 dias" color="text-foreground" to="/banco-horas" />
      </div>

      {/* Contract distribution */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Briefcase className="h-4 w-4 text-accent" /> Tipo de Contrato
        </h3>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(contractDist).filter(([, v]) => v > 0).map(([type, count]) => (
            <div key={type} className="rounded-lg bg-secondary px-3 py-2 text-center">
              <div className="text-lg font-bold text-foreground">{count}</div>
              <div className="text-[10px] text-muted-foreground uppercase">{type}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Top absentees */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
            <UserMinus className="h-4 w-4" /> Maiores Absenteistas (30 dias)
          </h3>
          {pontoStats.topAbsentees.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-success">
              <CheckCircle className="h-4 w-4" /> Nenhuma falta no periodo!
            </div>
          ) : (
            <div className="space-y-1.5">
              {pontoStats.topAbsentees.map(([empId, stats]) => (
                <div key={empId} className="flex items-center justify-between rounded-lg bg-destructive/5 px-3 py-2">
                  <span className="text-xs text-foreground">{empMap[empId] || empId}</span>
                  <span className="text-xs font-bold text-destructive">{stats.absences} falta(s)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top late */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-warning">
            <Clock className="h-4 w-4" /> Maiores Atrasados (30 dias)
          </h3>
          {pontoStats.topLate.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-success">
              <CheckCircle className="h-4 w-4" /> Todos pontuais no periodo!
            </div>
          ) : (
            <div className="space-y-1.5">
              {pontoStats.topLate.map(([empId, stats]) => (
                <div key={empId} className="flex items-center justify-between rounded-lg bg-warning/5 px-3 py-2">
                  <span className="text-xs text-foreground">{empMap[empId] || empId}</span>
                  <span className="text-xs font-bold text-warning">{stats.lates} atraso(s)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hiring recommendation */}
      <div className={`rounded-xl border-2 p-4 ${scheduleGap > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-success/30 bg-success/5'}`}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserPlus className="h-4 w-4" /> Recomendacao de Contratacao
        </h3>
        {scheduleGap > 0 ? (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-foreground">
              <strong className="text-destructive">{scheduleGap} vagas abertas</strong> na escala atual.
              Considerando absenteismo de {pontoStats.absenteeismRate}%, recomenda-se contratar pelo menos{' '}
              <strong className="text-destructive">
                {Math.ceil(scheduleGap / 7 * (1 + pontoStats.absenteeismRate / 100))} pessoa(s)
              </strong>.
            </p>
            <button onClick={() => navigate('/dimensionamento')} className="mt-1 text-primary underline">
              Ver calculadora completa de dimensionamento
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-success font-medium">Escala completa! Nao ha necessidade imediata de contratacao.</span>
          </div>
        )}
      </div>
    </div>
  )
}
