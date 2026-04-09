import { useState, useMemo, useEffect } from 'react'
import { Star, Send, MessageCircle, History } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useApp } from '@/store/AppContext'
import { useToast } from '@/components/ui/Toast'
import { cn, todayBR } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ShiftFeedback } from '@/types'

const CRITERIA = [
  { key: 'organizacao', label: 'Organizacao do ambiente', desc: 'Limpeza e organizacao do espaco de trabalho' },
  { key: 'equipamentos', label: 'Equipamentos e materiais', desc: 'Condicao e disponibilidade dos equipamentos' },
  { key: 'comunicacaoLider', label: 'Comunicacao do lider', desc: 'Clareza e apoio da lideranca' },
  { key: 'climaEquipe', label: 'Clima da equipe', desc: 'Ambiente e colaboracao entre colegas' },
  { key: 'cargaTrabalho', label: 'Carga de trabalho', desc: 'Distribuicao justa das tarefas' },
] as const

type ScoreKey = typeof CRITERIA[number]['key']

function getToday(): string {
  return todayBR()
}

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.getFullYear(), now.getMonth(), diff)
  return monday.toISOString().split('T')[0]
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function StarRating({
  value,
  hovered,
  onHover,
  onLeave,
  onChange,
  readonly,
}: {
  value: number
  hovered: number
  onHover: (n: number) => void
  onLeave: () => void
  onChange?: (n: number) => void
  readonly?: boolean
}) {
  const display = readonly ? value : (hovered || value)

  return (
    <div className="flex gap-1" onMouseLeave={onLeave}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onMouseEnter={() => !readonly && onHover(n)}
          onClick={() => onChange?.(n)}
          className={cn(
            'p-1.5 rounded-md transition-all',
            readonly ? 'cursor-default' : 'cursor-pointer active:scale-90',
            !readonly && 'hover:bg-primary/10',
          )}
          style={{ minWidth: 40, minHeight: 40 }}
        >
          <Star
            className={cn(
              'h-6 w-6 transition-colors',
              n <= display
                ? 'fill-primary text-primary'
                : 'text-muted-foreground/30',
            )}
          />
        </button>
      ))}
    </div>
  )
}

export default function AvaliacaoTurnoPage() {
  const { state, dispatch } = useApp()
  const { toast } = useToast()
  const loggedEmployeeId = state.currentUser.employeeId || ''
  const today = getToday()
  const weekStart = getWeekStart()

  // Load from API on mount
  useEffect(() => {
    api.get<ShiftFeedback[]>(`/api/shift-feedbacks/week/${weekStart}`)
      .then(data => dispatch({ type: 'SET_SHIFT_FEEDBACKS', payload: data }))
      .catch(() => {})
  }, [weekStart, dispatch])

  const [scores, setScores] = useState<Record<ScoreKey, number>>({
    organizacao: 0,
    equipamentos: 0,
    comunicacaoLider: 0,
    climaEquipe: 0,
    cargaTrabalho: 0,
  })
  const [hoveredStars, setHoveredStars] = useState<Record<ScoreKey, number>>({
    organizacao: 0,
    equipamentos: 0,
    comunicacaoLider: 0,
    climaEquipe: 0,
    cargaTrabalho: 0,
  })
  const [comments, setComments] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const alreadySubmittedToday = useMemo(
    () => state.shiftFeedbacks.some(
      (f) => f.employeeId === loggedEmployeeId && f.date === today,
    ),
    [state.shiftFeedbacks, loggedEmployeeId, today],
  )

  const myFeedbacks = useMemo(
    () =>
      [...state.shiftFeedbacks]
        .filter((f) => f.employeeId === loggedEmployeeId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.shiftFeedbacks, loggedEmployeeId],
  )

  const allFilled = Object.values(scores).every((v) => v > 0)

  async function handleSubmit() {
    if (!allFilled || alreadySubmittedToday) return

    const feedback: ShiftFeedback = {
      id: crypto.randomUUID(),
      employeeId: loggedEmployeeId,
      date: today,
      weekStart,
      scores: { ...scores },
      comments: comments.trim(),
      createdAt: new Date().toISOString(),
    }

    try {
      await api.post('/api/shift-feedbacks', feedback)
      const fresh = await api.get<ShiftFeedback[]>(`/api/shift-feedbacks/week/${weekStart}`)
      dispatch({ type: 'SET_SHIFT_FEEDBACKS', payload: fresh })
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as {message: unknown}).message) : ''
      if (msg.includes('409') || msg.includes('ja avaliou')) {
        toast('error', 'Voce ja avaliou seu turno hoje.')
      } else {
        dispatch({ type: 'ADD_SHIFT_FEEDBACK', payload: feedback })
        toast('error', 'Erro ao enviar avaliacao. Salvo localmente.')
      }
    }
    setSubmitted(true)
    setScores({
      organizacao: 0,
      equipamentos: 0,
      comunicacaoLider: 0,
      climaEquipe: 0,
      cargaTrabalho: 0,
    })
    setComments('')

    setTimeout(() => setSubmitted(false), 3000)
  }

  function setScore(key: ScoreKey, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }))
  }

  function setHover(key: ScoreKey, value: number) {
    setHoveredStars((prev) => ({ ...prev, [key]: value }))
  }

  function clearHover(key: ScoreKey) {
    setHoveredStars((prev) => ({ ...prev, [key]: 0 }))
  }

  const averageScore = (f: ShiftFeedback) => {
    const vals = Object.values(f.scores)
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avaliacao do Turno</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Avalie as condicoes do seu turno de trabalho
        </p>
      </div>

      {/* Form Card */}
      <Card>
        {alreadySubmittedToday ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
              <Star className="h-7 w-7 text-primary fill-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Avaliacao de hoje ja enviada
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Voce pode enviar uma nova avaliacao amanha.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Como foi seu turno hoje?
              </h2>
            </div>

            {/* Criteria */}
            <div className="space-y-4">
              {CRITERIA.map((c) => (
                <div key={c.key} className="space-y-1.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                  <StarRating
                    value={scores[c.key]}
                    hovered={hoveredStars[c.key]}
                    onHover={(n) => setHover(c.key, n)}
                    onLeave={() => clearHover(c.key)}
                    onChange={(n) => setScore(c.key, n)}
                  />
                </div>
              ))}
            </div>

            {/* Comments */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Comentarios (opcional)
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Algo que queira compartilhar sobre o turno..."
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!allFilled}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all',
                allFilled
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              <Send className="h-4 w-4" />
              Enviar Avaliacao
            </button>

            {submitted && (
              <p className="text-center text-sm text-green-400 font-medium animate-pulse">
                Avaliacao enviada com sucesso!
              </p>
            )}
          </div>
        )}
      </Card>

      {/* History */}
      {myFeedbacks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">
              Minhas Avaliacoes
            </h2>
          </div>

          <div className="space-y-3">
            {myFeedbacks.map((f) => (
              <Card key={f.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {formatDate(f.date)}
                  </span>
                  <span className="text-xs font-semibold text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                    Media: {averageScore(f)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {CRITERIA.map((c) => (
                    <div key={c.key} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{c.label}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={cn(
                              'h-3.5 w-3.5',
                              n <= f.scores[c.key]
                                ? 'fill-primary text-primary'
                                : 'text-muted-foreground/20',
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {f.comments && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2 italic">
                    &ldquo;{f.comments}&rdquo;
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
