import { useState, useEffect, useMemo } from 'react'
import { Smile, BarChart3, MessageSquare } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Card } from '@/components/ui/Card'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import type { ClimateSurveyResults } from '@/types'

function getWeekKey(date = new Date()): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function scoreColor(score: number): string {
  if (score >= 4) return 'text-success'
  if (score >= 3) return 'text-warning'
  return 'text-destructive'
}

const SCORE_LABELS: Record<number, string> = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Ótimo' }
const SCORE_EMOJIS: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '😊', 5: '🤩' }

export default function ClimaPesquisaPage() {
  const { state } = useApp()
  const { toast } = useToast()
  const role = state.currentUser.role
  const isManager = role === 'admin' || role === 'gerente' || role === 'rh'
  const currentWeek = getWeekKey()

  // Colaborador state
  const [answered, setAnswered] = useState(false)
  const [loadingCheck, setLoadingCheck] = useState(true)
  const [score, setScore] = useState(0)
  const [highlights, setHighlights] = useState('')
  const [improvements, setImprovements] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Manager state
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [results, setResults] = useState<ClimateSurveyResults | null>(null)
  const [loadingResults, setLoadingResults] = useState(false)

  // Generate week options (last 8 weeks)
  const weekOptions = useMemo(() => {
    const opts: string[] = []
    for (let i = 0; i < 8; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i * 7)
      opts.push(getWeekKey(d))
    }
    return opts
  }, [])

  // Colaborador: check if already answered
  useEffect(() => {
    if (isManager) return
    const employeeId = state.currentUser.employeeId
    if (!employeeId) { setLoadingCheck(false); return }
    api.get<{ answered: boolean }>(`/api/surveys/check/${currentWeek}/${employeeId}`)
      .then(r => setAnswered(r.answered))
      .catch(() => {})
      .finally(() => setLoadingCheck(false))
  }, [isManager, state.currentUser.employeeId, currentWeek])

  // Manager: load results
  useEffect(() => {
    if (!isManager) return
    setLoadingResults(true)
    api.get<ClimateSurveyResults>(`/api/surveys/results?week=${selectedWeek}`)
      .then(setResults)
      .catch(() => toast('error', 'Erro ao carregar resultados'))
      .finally(() => setLoadingResults(false))
  }, [isManager, selectedWeek])

  async function handleSubmit() {
    const employeeId = state.currentUser.employeeId
    if (!employeeId || score === 0) return
    setSubmitting(true)
    try {
      await api.post('/api/surveys', { week: currentWeek, employeeId, score, highlights, improvements })
      setAnswered(true)
      toast('success', 'Resposta enviada! Obrigado.')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao enviar')
    } finally {
      setSubmitting(false)
    }
  }

  const barData = results ? [1, 2, 3, 4, 5].map(s => ({
    score: SCORE_LABELS[s], count: results.scoreDistribution[s] || 0
  })) : []

  // ── COLABORADOR VIEW ──────────────────────────────────────────────
  if (!isManager) {
    if (loadingCheck) {
      return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
    }

    if (answered) {
      return (
        <div className="animate-fade-in flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <Smile className="h-10 w-10 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Obrigado pela resposta!</h2>
          <p className="text-sm text-muted-foreground">Você já respondeu a pesquisa desta semana ({currentWeek}).<br />Nova pesquisa disponível na próxima semana.</p>
        </div>
      )
    }

    return (
      <div className="animate-fade-in space-y-6 p-4 lg:p-6 max-w-lg mx-auto">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Pesquisa de Clima</h1>
          <p className="mt-1 text-sm text-muted-foreground">Semana {currentWeek} — leva menos de 1 minuto</p>
        </div>

        <Card variant="glass" className="space-y-4 p-6">
          <p className="text-center text-base font-medium text-foreground">Como foi seu clima no trabalho essa semana?</p>
          <div className="flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onClick={() => setScore(s)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl p-3 transition-all',
                  score === s ? 'bg-primary/20 ring-2 ring-primary scale-110' : 'hover:bg-muted'
                )}
              >
                <span className="text-2xl">{SCORE_EMOJIS[s]}</span>
                <span className="text-[10px] font-medium text-muted-foreground">{SCORE_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">O que foi positivo esta semana? (opcional)</label>
            <textarea
              value={highlights}
              onChange={e => setHighlights(e.target.value)}
              rows={2}
              placeholder="Trabalho em equipe, comunicação, organização..."
              className="w-full resize-none rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">O que pode melhorar? (opcional)</label>
            <textarea
              value={improvements}
              onChange={e => setImprovements(e.target.value)}
              rows={2}
              placeholder="Comunicação, processos, equipamentos..."
              className="w-full resize-none rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <button
          onClick={() => void handleSubmit()}
          disabled={score === 0 || submitting}
          className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {submitting ? 'Enviando...' : 'Enviar Resposta'}
        </button>
      </div>
    )
  }

  // ── MANAGER VIEW ──────────────────────────────────────────────────
  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pesquisa de Clima</h1>
          <p className="mt-1 text-sm text-muted-foreground">Resultados agregados por semana</p>
        </div>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {weekOptions.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      {loadingResults ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : !results || results.totalResponses === 0 ? (
        <div className="py-12 text-center text-muted-foreground">Nenhuma resposta para esta semana.</div>
      ) : (
        <div className="space-y-4">
          {/* Nota média */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card variant="glass" className="flex items-center gap-4 p-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nota média</p>
                <p className={cn('text-4xl font-bold', scoreColor(results.avgScore))}>{results.avgScore}</p>
                <p className="text-xs text-muted-foreground">{results.totalResponses} respostas</p>
              </div>
            </Card>

            <Card variant="glass" className="p-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Distribuição</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={barData} margin={{ top: 0, right: 0, bottom: 0, left: -30 }}>
                  <XAxis dataKey="score" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={i < 2 ? 'hsl(var(--destructive))' : i === 2 ? 'hsl(var(--warning))' : 'hsl(var(--success))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Destaques */}
          {results.highlights.filter(Boolean).length > 0 && (
            <Card variant="glass" className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-success" />
                <p className="text-sm font-semibold text-foreground">Pontos positivos</p>
              </div>
              <div className="space-y-1">
                {results.highlights.filter(Boolean).map((h, i) => (
                  <p key={i} className="text-sm text-muted-foreground border-l-2 border-success/40 pl-3">{h}</p>
                ))}
              </div>
            </Card>
          )}

          {/* Melhorias */}
          {results.improvements.filter(Boolean).length > 0 && (
            <Card variant="glass" className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-warning" />
                <p className="text-sm font-semibold text-foreground">Pontos a melhorar</p>
              </div>
              <div className="space-y-1">
                {results.improvements.filter(Boolean).map((h, i) => (
                  <p key={i} className="text-sm text-muted-foreground border-l-2 border-warning/40 pl-3">{h}</p>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
