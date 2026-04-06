import { useState, useMemo, useEffect } from 'react'
import { useApp } from '@/store/AppContext'
import { useToast } from '@/components/ui/Toast'
import { Star, MessageSquare, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { FeedbackRecord } from '@/types'

const CRITERIA = [
  { key: 'proatividade', label: 'Proatividade', desc: 'Iniciativa e autonomia nas tarefas' },
  { key: 'trabalhoEquipe', label: 'Trabalho em Equipe', desc: 'Colaboracao e apoio aos colegas' },
  { key: 'comunicacao', label: 'Comunicacao', desc: 'Clareza e eficiencia na comunicacao' },
  { key: 'qualidade', label: 'Qualidade', desc: 'Padrao de execucao e atencao aos detalhes' },
  { key: 'pontualidade', label: 'Pontualidade', desc: 'Cumprimento de horarios e prazos' },
] as const

function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={`${readonly ? '' : 'cursor-pointer hover:scale-110'} transition-transform`}
        >
          <Star className={`h-5 w-5 ${n <= value ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
    </div>
  )
}

export default function FeedbackPage() {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const role = state.currentUser.role
  const loggedEmployeeId = state.currentUser.employeeId || ''
  const [showForm, setShowForm] = useState(false)
  const [formEmployee, setFormEmployee] = useState('')
  const [scores, setScores] = useState({ proatividade: 0, trabalhoEquipe: 0, comunicacao: 0, qualidade: 0, pontualidade: 0 })
  const [strengths, setStrengths] = useState('')
  const [improvements, setImprovements] = useState('')
  const [notes, setNotes] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const activeEmployees = state.employees.filter(e => e.status === 'ativo')

  // Load from API on mount
  useEffect(() => {
    api.get<FeedbackRecord[]>(`/api/feedbacks/week/${state.currentWeek}`)
      .then(data => dispatch({ type: 'SET_FEEDBACKS', payload: data }))
      .catch(() => {})
  }, [state.currentWeek, dispatch])

  const visibleFeedbacks = useMemo(() => {
    if (role === 'colaborador') {
      return state.feedbacks.filter(f => f.employeeId === loggedEmployeeId)
    }
    return [...state.feedbacks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [state.feedbacks, role, loggedEmployeeId])

  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    state.employees.forEach(e => { m[e.id] = e.name })
    return m
  }, [state.employees])

  // Average scores per employee
  const employeeAverages = useMemo(() => {
    const avgs: Record<string, { total: number; count: number; avg: number }> = {}
    state.feedbacks.forEach(f => {
      if (!avgs[f.employeeId]) avgs[f.employeeId] = { total: 0, count: 0, avg: 0 }
      const avg = (f.scores.proatividade + f.scores.trabalhoEquipe + f.scores.comunicacao + f.scores.qualidade + f.scores.pontualidade) / 5
      avgs[f.employeeId].total += avg
      avgs[f.employeeId].count++
    })
    Object.keys(avgs).forEach(id => {
      avgs[id].avg = avgs[id].total / avgs[id].count
    })
    return avgs
  }, [state.feedbacks])

  async function submitFeedback() {
    if (!formEmployee || Object.values(scores).some(s => s === 0)) return

    const record: FeedbackRecord = {
      id: crypto.randomUUID(),
      employeeId: formEmployee,
      weekStart: state.currentWeek,
      evaluatorId: loggedEmployeeId,
      scores,
      strengths,
      improvements,
      notes,
      createdAt: new Date().toISOString(),
    }

    try {
      await api.post('/api/feedbacks', record)
      const fresh = await api.get<FeedbackRecord[]>(`/api/feedbacks/week/${state.currentWeek}`)
      dispatch({ type: 'SET_FEEDBACKS', payload: fresh })
      toast('success', 'Feedback enviado!')
    } catch {
      dispatch({ type: 'ADD_FEEDBACK', payload: record })
      toast('error', 'Erro ao enviar feedback. Salvo localmente.')
    }
    setShowForm(false)
    setFormEmployee('')
    setScores({ proatividade: 0, trabalhoEquipe: 0, comunicacao: 0, qualidade: 0, pontualidade: 0 })
    setStrengths('')
    setImprovements('')
    setNotes('')
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Avaliacao Semanal</h2>
          <p className="text-sm text-muted-foreground">
            {role === 'colaborador' ? 'Veja suas avaliacoes' : 'Avalie seus colaboradores semanalmente'}
          </p>
        </div>
        {role !== 'colaborador' && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Avaliar
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Colaborador</label>
            <select value={formEmployee} onChange={e => setFormEmployee(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
              <option value="">Selecione</option>
              {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {CRITERIA.map(c => (
              <div key={c.key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-foreground">{c.label}</div>
                  <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                </div>
                <StarRating
                  value={scores[c.key]}
                  onChange={v => setScores(s => ({ ...s, [c.key]: v }))}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Pontos fortes</label>
              <textarea value={strengths} onChange={e => setStrengths(e.target.value)} rows={2} placeholder="O que o colaborador faz bem..." className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Pontos a melhorar</label>
              <textarea value={improvements} onChange={e => setImprovements(e.target.value)} rows={2} placeholder="Onde pode evoluir..." className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Observacoes (opcional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
          </div>

          <button onClick={submitFeedback} disabled={!formEmployee || Object.values(scores).some(s => s === 0)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Enviar Avaliacao
          </button>
        </div>
      )}

      {/* Employee averages (leader view) */}
      {role !== 'colaborador' && Object.keys(employeeAverages).length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Media por Colaborador</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(employeeAverages)
              .sort((a, b) => b[1].avg - a[1].avg)
              .map(([empId, data]) => (
                <div key={empId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold text-foreground">
                    {(empMap[empId] || '?')[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{empMap[empId]}</div>
                    <div className="text-xs text-muted-foreground">{data.count} avaliacoes</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    <span className="text-sm font-bold text-foreground">{data.avg.toFixed(1)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Feedback history */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Historico</h3>
        {visibleFeedbacks.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-30" />
            Nenhuma avaliacao registrada
          </div>
        ) : (
          <div className="space-y-2">
            {visibleFeedbacks.map(fb => {
              const avg = (fb.scores.proatividade + fb.scores.trabalhoEquipe + fb.scores.comunicacao + fb.scores.qualidade + fb.scores.pontualidade) / 5
              const isExpanded = expandedId === fb.id
              return (
                <div key={fb.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : fb.id)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <Star className="h-5 w-5 shrink-0 fill-primary text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {empMap[fb.employeeId]} · <span className="text-primary">{avg.toFixed(1)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Semana {new Date(fb.weekStart + 'T00:00:00').toLocaleDateString('pt-BR')}
                        {role !== 'colaborador' && ` · por ${empMap[fb.evaluatorId] || 'Lider'}`}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                      {CRITERIA.map(c => (
                        <div key={c.key} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{c.label}</span>
                          <StarRating value={fb.scores[c.key]} readonly />
                        </div>
                      ))}
                      {fb.strengths && (
                        <div className="text-xs">
                          <span className="text-success font-medium">Pontos fortes: </span>
                          <span className="text-foreground">{fb.strengths}</span>
                        </div>
                      )}
                      {fb.improvements && (
                        <div className="text-xs">
                          <span className="text-warning font-medium">A melhorar: </span>
                          <span className="text-foreground">{fb.improvements}</span>
                        </div>
                      )}
                      {fb.notes && <div className="text-xs text-muted-foreground italic">{fb.notes}</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
