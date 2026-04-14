import { useMemo, useState } from 'react'
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
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { getRhInsights } from '@/services/aiService'
import type { RhInsightsResult } from '@/services/aiService'

export default function RHDashboardPage() {
  const { state } = useApp()
  const navigate = useNavigate()
  const [aiInsights, setAiInsights] = useState<RhInsightsResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [hireModal, setHireModal] = useState(false)
  const [hireForm, setHireForm] = useState({ role: 'auxiliar', quantity: 1, priority: 'media', reason: '' })
  const [hireLoading, setHireLoading] = useState(false)
  const [hireMsg, setHireMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function submitHireRequest() {
    setHireLoading(true)
    setHireMsg(null)
    try {
      const res = await fetch('/api/hiring-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(hireForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
      setHireMsg({ type: 'success', text: 'Solicitação enviada ao Orion RH!' })
      setHireForm({ role: 'auxiliar', quantity: 1, priority: 'media', reason: '' })
      setTimeout(() => { setHireModal(false); setHireMsg(null) }, 1500)
    } catch (err) {
      setHireMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao enviar' })
    } finally {
      setHireLoading(false)
    }
  }

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

  async function analyzeWithAI() {
    setAiLoading(true)
    setAiError(null)
    setAiOpen(true)
    try {
      const result = await getRhInsights({
        employees: { total: activeEmployees.length, vacation: onVacation.length, inactive: state.employees.filter(e => e.status === 'inativo').length },
        pontoStats: { absences: pontoStats.absences, lates: pontoStats.lates, totalWorked: pontoStats.totalWorked },
        topAbsentees: pontoStats.topAbsentees,
        employeeNames: Object.fromEntries(state.employees.map(e => [e.id, e.nickname || e.name])),
      })
      setAiInsights(result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao consultar IA')
    } finally {
      setAiLoading(false)
    }
  }

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

      {/* AI Insights */}
      <div className="rounded-xl border border-primary/30 bg-primary/5">
        <button
          onClick={aiOpen ? () => setAiOpen(false) : analyzeWithAI}
          disabled={aiLoading}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-primary">Análise de RH com IA</span>
            {aiLoading && <span className="text-xs text-muted-foreground animate-pulse">Analisando...</span>}
          </div>
          {aiOpen ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
        </button>

        {aiOpen && (
          <div className="border-t border-primary/20 px-4 pb-4 pt-3 space-y-3">
            {aiError && (
              <p className="text-xs text-destructive">{aiError}</p>
            )}
            {aiInsights && (
              <>
                <p className="text-xs text-foreground">{aiInsights.summary}</p>

                {aiInsights.alerts.length > 0 && (
                  <div className="space-y-1.5">
                    {aiInsights.alerts.map((alert, i) => (
                      <div key={i} className={`rounded-lg px-3 py-2 text-xs ${
                        alert.level === 'critical' ? 'bg-destructive/10 text-destructive' :
                        alert.level === 'warning'  ? 'bg-warning/10 text-warning' :
                                                     'bg-primary/10 text-primary'
                      }`}>
                        {alert.text}
                      </div>
                    ))}
                  </div>
                )}

                {aiInsights.recommendations.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recomendações</p>
                    <ul className="space-y-1">
                      {aiInsights.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {!aiInsights && !aiLoading && !aiError && (
              <p className="text-xs text-muted-foreground">Clique no botão acima para gerar análise.</p>
            )}
          </div>
        )}
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
            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                onClick={() => {
                  const suggested = Math.ceil(scheduleGap / 7 * (1 + pontoStats.absenteeismRate / 100))
                  setHireForm({
                    role: 'auxiliar',
                    quantity: suggested,
                    priority: pontoStats.absenteeismRate > 10 ? 'alta' : 'media',
                    reason: `${scheduleGap} vagas abertas na escala, absenteísmo de ${pontoStats.absenteeismRate}%`,
                  })
                  setHireModal(true)
                }}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
              >
                Solicitar contratação
              </button>
              <button onClick={() => navigate('/dimensionamento')} className="text-primary underline">
                Ver calculadora completa
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-success font-medium">Escala completa! Nao ha necessidade imediata de contratacao.</span>
            </div>
            <button
              onClick={() => setHireModal(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Solicitar contratação mesmo assim
            </button>
          </div>
        )}
      </div>

      {hireModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => !hireLoading && setHireModal(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-semibold">Solicitar contratação</h2>
              <p className="text-xs text-muted-foreground">Esta solicitação será enviada ao Orion RH</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Cargo *</label>
                <select
                  value={hireForm.role}
                  onChange={e => setHireForm({ ...hireForm, role: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="auxiliar">Auxiliar Operacional</option>
                  <option value="lider">Líder</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="gerente">Gerente</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Quantidade *</label>
                  <input
                    type="number"
                    min={1}
                    value={hireForm.quantity}
                    onChange={e => setHireForm({ ...hireForm, quantity: Number(e.target.value) })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Prioridade</label>
                  <select
                    value={hireForm.priority}
                    onChange={e => setHireForm({ ...hireForm, priority: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Motivo / contexto</label>
                <textarea
                  value={hireForm.reason}
                  onChange={e => setHireForm({ ...hireForm, reason: e.target.value })}
                  rows={3}
                  placeholder="Ex: absenteísmo elevado, expansão da operação, substituição..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            {hireMsg && (
              <div className={`text-xs p-2 rounded ${hireMsg.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {hireMsg.text}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setHireModal(false)}
                disabled={hireLoading}
                className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={submitHireRequest}
                disabled={hireLoading || !hireForm.role}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {hireLoading ? 'Enviando...' : 'Enviar solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
