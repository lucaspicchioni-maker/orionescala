import { useState, useMemo } from 'react'
import {
  Crown,
  Medal,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Award,
  Target,
  Clock,
  Zap,
  AlertTriangle,
  Gauge,
} from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

interface EmployeeScore {
  id: string
  name: string
  assiduidade: number
  pontualidade: number
  produtividade: number
  indiceErros: number // raw error rate 0-5
  sla: number
  scoreTotal: number
  trend: 'up' | 'down' | 'stable'
  previousScore: number
}

type Period = 'week' | 'month' | '3months'

// ── Helpers ────────────────────────────────────────────────────────────

function seededRandom(seed: string, index: number): number {
  let h = 0
  const str = seed + index.toString()
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  h = Math.abs(h)
  return (h % 10000) / 10000
}

function randomInRange(seed: string, idx: number, min: number, max: number): number {
  return min + seededRandom(seed, idx) * (max - min)
}

function calculateWeightedScore(scores: {
  assiduidade: number
  pontualidade: number
  produtividade: number
  indiceErros: number
  sla: number
}): number {
  const errorScore = Math.max(0, 100 - scores.indiceErros * 20)
  return (
    scores.assiduidade * 0.25 +
    scores.pontualidade * 0.2 +
    scores.produtividade * 0.25 +
    errorScore * 0.15 +
    scores.sla * 0.15
  )
}

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Esta Semana' },
  { key: 'month', label: 'Este Mes' },
  { key: '3months', label: 'Ultimos 3 Meses' },
]

// ── Trend Icon Component ───────────────────────────────────────────────

function TrendIndicator({ trend, diff }: { trend: 'up' | 'down' | 'stable'; diff: number }) {
  if (trend === 'up') {
    return (
      <span className="flex items-center gap-1 text-success">
        <TrendingUp className="h-4 w-4" />
        <span className="text-xs font-medium">+{diff.toFixed(1)}</span>
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span className="flex items-center gap-1 text-destructive">
        <TrendingDown className="h-4 w-4" />
        <span className="text-xs font-medium">{diff.toFixed(1)}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" />
      <span className="text-xs font-medium">0.0</span>
    </span>
  )
}

// ── Score Badge ────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 90 ? 'success' : score >= 75 ? 'warning' : 'destructive'
  return (
    <Badge variant={variant} size="md" className="min-w-[52px] justify-center font-bold">
      {score.toFixed(1)}
    </Badge>
  )
}

// ── Metric Bar ─────────────────────────────────────────────────────────

function MetricBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  const color =
    value >= 90
      ? 'bg-success'
      : value >= 75
        ? 'bg-warning'
        : 'bg-destructive'

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full max-w-[80px] overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground">{value.toFixed(1)}%</span>
    </div>
  )
}

// ── Podium Card ────────────────────────────────────────────────────────

function PodiumCard({
  employee,
  position,
}: {
  employee: EmployeeScore
  position: 1 | 2 | 3
}) {
  const config = {
    1: {
      borderColor: '#FFD700',
      glowColor: 'rgba(255, 215, 0, 0.15)',
      icon: <Crown className="h-8 w-8 text-yellow-400" />,
      height: 'min-h-[280px]',
      label: '1o Lugar',
      bg: 'from-yellow-500/10 to-transparent',
    },
    2: {
      borderColor: '#C0C0C0',
      glowColor: 'rgba(192, 192, 192, 0.1)',
      icon: <Medal className="h-6 w-6 text-gray-400" />,
      height: 'min-h-[250px]',
      label: '2o Lugar',
      bg: 'from-gray-400/10 to-transparent',
    },
    3: {
      borderColor: '#CD7F32',
      glowColor: 'rgba(205, 127, 50, 0.1)',
      icon: <Medal className="h-6 w-6 text-orange-400" />,
      height: 'min-h-[230px]',
      label: '3o Lugar',
      bg: 'from-orange-500/10 to-transparent',
    },
  }

  const c = config[position]
  const initial = employee.name.charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        'glass relative flex flex-col items-center justify-center rounded-xl p-6 hover-lift transition-all duration-300',
        c.height,
        position === 1 ? 'z-10 scale-105' : 'z-0',
      )}
      style={{
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: c.borderColor,
        boxShadow: `0 0 30px ${c.glowColor}, 0 0 60px ${c.glowColor}`,
      }}
    >
      <div className={cn('absolute inset-0 rounded-xl bg-gradient-to-b', c.bg)} />
      <div className="relative z-10 flex flex-col items-center gap-3">
        {c.icon}
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold"
          style={{
            backgroundColor: c.glowColor,
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: c.borderColor,
            color: c.borderColor,
          }}
        >
          {initial}
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{employee.name}</p>
          <p className="text-xs text-muted-foreground">{c.label}</p>
        </div>
        <ScoreBadge score={employee.scoreTotal} />
        <TrendIndicator
          trend={employee.trend}
          diff={employee.scoreTotal - employee.previousScore}
        />
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────

export default function RankingPage() {
  const { state } = useApp()
  const [period, setPeriod] = useState<Period>('month')

  const rankings = useMemo<EmployeeScore[]>(() => {
    const activeEmployees = state.employees.filter((e) => e.status === 'ativo')

    const scores = activeEmployees.map((emp, empIdx) => {
      const seed = emp.id + period
      const assiduidade = randomInRange(seed, empIdx * 10 + 1, 80, 100)
      const pontualidade = randomInRange(seed, empIdx * 10 + 2, 75, 100)
      const produtividade = randomInRange(seed, empIdx * 10 + 3, 60, 100)
      const indiceErros = randomInRange(seed, empIdx * 10 + 4, 0, 5)
      const sla = randomInRange(seed, empIdx * 10 + 5, 85, 100)

      const scoreTotal = calculateWeightedScore({
        assiduidade,
        pontualidade,
        produtividade,
        indiceErros,
        sla,
      })

      // Generate a "previous" score for trend
      const prevSeed = emp.id + period + 'prev'
      const prevScore = calculateWeightedScore({
        assiduidade: randomInRange(prevSeed, empIdx * 10 + 1, 78, 100),
        pontualidade: randomInRange(prevSeed, empIdx * 10 + 2, 73, 100),
        produtividade: randomInRange(prevSeed, empIdx * 10 + 3, 58, 100),
        indiceErros: randomInRange(prevSeed, empIdx * 10 + 4, 0, 5),
        sla: randomInRange(prevSeed, empIdx * 10 + 5, 83, 100),
      })

      const diff = scoreTotal - prevScore
      const trend: 'up' | 'down' | 'stable' =
        diff > 1.5 ? 'up' : diff < -1.5 ? 'down' : 'stable'

      return {
        id: emp.id,
        name: emp.name,
        assiduidade,
        pontualidade,
        produtividade,
        indiceErros,
        sla,
        scoreTotal,
        trend,
        previousScore: prevScore,
      }
    })

    return scores.sort((a, b) => b.scoreTotal - a.scoreTotal)
  }, [state.employees, period])

  const top3 = rankings.slice(0, 3)

  return (
    <div className="animate-fade-in space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Award className="h-7 w-7 text-primary" />
            Ranking de Colaboradores
          </h1>
          <p className="text-sm text-muted-foreground">Desempenho e recompensas</p>
        </div>

        {/* Period Selector */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-all',
                period === opt.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
          <div className="order-2 sm:order-1">
            <PodiumCard employee={top3[1]} position={2} />
          </div>
          <div className="order-1 sm:order-2">
            <PodiumCard employee={top3[0]} position={1} />
          </div>
          <div className="order-3">
            <PodiumCard employee={top3[2]} position={3} />
          </div>
        </div>
      )}

      {/* Ranking Table */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Target className="h-4 w-4" />
          Classificacao Completa
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 text-center">#</th>
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Assiduidade
                  </span>
                </th>
                <th className="px-3 py-2.5">
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> Pontualidade
                  </span>
                </th>
                <th className="px-3 py-2.5">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Produtividade
                  </span>
                </th>
                <th className="px-3 py-2.5">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Ind. Erros
                  </span>
                </th>
                <th className="px-3 py-2.5">
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" /> SLA
                  </span>
                </th>
                <th className="px-3 py-2.5 text-center">Score Total</th>
                <th className="px-3 py-2.5 text-center">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((emp, idx) => {
                const position = idx + 1
                const errorScore = Math.max(0, 100 - emp.indiceErros * 20)
                const isTopThree = position <= 3

                return (
                  <tr
                    key={emp.id}
                    className={cn(
                      'border-b border-border/50 transition-colors hover:bg-muted/30',
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10',
                      isTopThree && 'bg-primary/5',
                    )}
                  >
                    <td className="px-3 py-3 text-center">
                      {position <= 3 ? (
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                          style={{
                            backgroundColor:
                              position === 1
                                ? 'rgba(255,215,0,0.2)'
                                : position === 2
                                  ? 'rgba(192,192,192,0.2)'
                                  : 'rgba(205,127,50,0.2)',
                            color:
                              position === 1
                                ? '#FFD700'
                                : position === 2
                                  ? '#C0C0C0'
                                  : '#CD7F32',
                          }}
                        >
                          {position}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-medium">{position}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {emp.name.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <MetricBar value={emp.assiduidade} />
                    </td>
                    <td className="px-3 py-3">
                      <MetricBar value={emp.pontualidade} />
                    </td>
                    <td className="px-3 py-3">
                      <MetricBar value={emp.produtividade} />
                    </td>
                    <td className="px-3 py-3">
                      <MetricBar value={errorScore} />
                    </td>
                    <td className="px-3 py-3">
                      <MetricBar value={emp.sla} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <ScoreBadge score={emp.scoreTotal} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <TrendIndicator
                        trend={emp.trend}
                        diff={emp.scoreTotal - emp.previousScore}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Rewards / Criteria Section */}
      <Card variant="glass">
        <h3 className="mb-4 text-lg font-bold text-foreground flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          Criterios de Valorizacao
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Tiers */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Niveis de Reconhecimento
            </h4>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                <span className="text-2xl">&#11088;&#11088;&#11088;</span>
                <div>
                  <p className="font-semibold text-foreground">Ouro (Score 90+)</p>
                  <p className="text-xs text-muted-foreground">
                    Bonus de desempenho + prioridade na escolha de turnos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                <span className="text-2xl">&#11088;&#11088;</span>
                <div>
                  <p className="font-semibold text-foreground">Prata (Score 75-89)</p>
                  <p className="text-xs text-muted-foreground">
                    Reconhecimento em equipe + certificado mensal
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                <span className="text-2xl">&#11088;</span>
                <div>
                  <p className="font-semibold text-foreground">Bronze (Score {'<'}75)</p>
                  <p className="text-xs text-muted-foreground">
                    Plano de melhoria com acompanhamento semanal
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Weights */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Peso dos Indicadores
            </h4>

            <div className="space-y-3">
              {[
                { label: 'Assiduidade', weight: 25, icon: Clock, desc: 'Presenca nos turnos escalados' },
                { label: 'Pontualidade', weight: 20, icon: Gauge, desc: 'Chegada no horario correto' },
                { label: 'Produtividade', weight: 25, icon: Zap, desc: 'Pedidos processados por hora' },
                { label: 'Indice de Erros', weight: 15, icon: AlertTriangle, desc: 'Taxa de erros (menor = melhor)' },
                { label: 'SLA', weight: 15, icon: Target, desc: 'Cumprimento de metas de atendimento' },
              ].map((kpi) => (
                <div key={kpi.label} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <kpi.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{kpi.label}</span>
                      <Badge variant="default" size="sm">
                        {kpi.weight}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{kpi.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
