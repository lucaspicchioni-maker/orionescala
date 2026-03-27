import { useState, useMemo } from 'react'
import { useApp } from '@/store/AppContext'
import { FileDown, Calendar, Users, Clock, TrendingUp, ThumbsUp, ThumbsDown, Shield } from 'lucide-react'
import { evaluateRules } from '@/services/rulesEngine'
import type { RuleLayer } from '@/types'

type ReportType = 'escala' | 'ponto' | 'produtividade' | 'banco_horas' | 'colaboradores'

interface ReportConfig {
  type: ReportType
  label: string
  description: string
  icon: typeof FileDown
  roles: ('colaborador' | 'supervisor' | 'gerente' | 'rh')[]
}

const REPORTS: ReportConfig[] = [
  { type: 'escala', label: 'Escala Semanal', description: 'Exporta a escala com turnos e status de cada colaborador', icon: Calendar, roles: ['supervisor', 'gerente'] },
  { type: 'ponto', label: 'Registro de Ponto', description: 'Check-ins, atrasos, faltas e horas trabalhadas', icon: Clock, roles: ['supervisor', 'gerente'] },
  { type: 'produtividade', label: 'Produtividade', description: 'Pedidos, erros, SLA e tempo de expedicao por colaborador', icon: TrendingUp, roles: ['supervisor', 'gerente'] },
  { type: 'banco_horas', label: 'Banco de Horas', description: 'Saldo de horas extras e deficit de cada colaborador', icon: Clock, roles: ['supervisor', 'gerente'] },
  { type: 'colaboradores', label: 'Colaboradores', description: 'Listagem completa com dados, funcao e status', icon: Users, roles: ['gerente'] },
]

function escapeCSV(val: string | number): string {
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ].join('\n')

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function RelatoriosPage() {
  const { state } = useApp()
  const [selectedWeek, setSelectedWeek] = useState(state.currentWeek)
  const [generating, setGenerating] = useState<ReportType | null>(null)

  const role = state.currentUser.role
  const availableReports = role === 'admin' ? REPORTS : REPORTS.filter(r => r.roles.includes(role))

  const weekOptions = useMemo(() => {
    const weeks = new Set<string>()
    weeks.add(state.currentWeek)
    state.schedules.forEach(s => weeks.add(s.weekStart))
    state.pontoRecords.forEach(p => {
      const d = new Date(p.date)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      weeks.add(new Date(d.setDate(diff)).toISOString().split('T')[0])
    })
    return Array.from(weeks).sort().reverse()
  }, [state.currentWeek, state.schedules, state.pontoRecords])

  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    state.employees.forEach(e => { m[e.id] = e.name })
    return m
  }, [state.employees])

  function generate(type: ReportType) {
    setGenerating(type)
    setTimeout(() => {
      switch (type) {
        case 'escala': {
          const schedule = state.schedules.find(s => s.weekStart === selectedWeek)
          if (!schedule) { alert('Nenhuma escala encontrada para esta semana.'); break }
          const headers = ['Data', 'Dia', 'Horario', 'Colaborador', 'Status']
          const rows: (string | number)[][] = []
          for (const day of schedule.days) {
            for (const slot of day.slots) {
              for (const a of slot.assignments) {
                rows.push([day.date, day.dayOfWeek, slot.hour, empMap[a.employeeId] || a.employeeId, a.status])
              }
            }
          }
          downloadCSV(`escala_${selectedWeek}.csv`, headers, rows)
          break
        }
        case 'ponto': {
          const records = state.pontoRecords.filter(p => {
            const d = new Date(p.date)
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1)
            const ws = new Date(d.setDate(diff)).toISOString().split('T')[0]
            return ws === selectedWeek
          })
          const headers = ['Data', 'Colaborador', 'Esc. Inicio', 'Esc. Fim', 'Check-in', 'Check-out', 'Atraso (min)', 'Saida Antecip. (min)', 'Trabalhado (min)', 'Status']
          const rows = records.map(p => [
            p.date, empMap[p.employeeId] || p.employeeId,
            p.scheduledStart || '-', p.scheduledEnd || '-',
            p.checkIn ? new Date(p.checkIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
            p.checkOut ? new Date(p.checkOut).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
            p.lateMinutes, p.earlyLeaveMinutes, p.workedMinutes, p.status,
          ])
          downloadCSV(`ponto_${selectedWeek}.csv`, headers, rows)
          break
        }
        case 'produtividade': {
          const records = state.productivityRecords.filter(r => r.weekStart === selectedWeek)
          const headers = ['Data', 'Colaborador', 'Pedidos', 'Erros', 'Custo Erros (R$)', 'Tempo Expedicao (s)', 'SLA (%)', 'Pedidos/Hora', 'Horas']
          const rows = records.map(r => [
            r.date, empMap[r.employeeId] || r.employeeId,
            r.totalOrders, r.totalErrors, r.errorCost,
            r.avgExpeditionTime, r.slaCompliance, r.ordersPerHour, r.hoursWorked,
          ])
          downloadCSV(`produtividade_${selectedWeek}.csv`, headers, rows)
          break
        }
        case 'banco_horas': {
          const records = state.bancoHoras.filter(b => b.weekStart === selectedWeek)
          const headers = ['Data', 'Colaborador', 'Escalado (min)', 'Trabalhado (min)', 'Saldo (min)', 'Tipo', 'Obs']
          const rows = records.map(b => [
            b.date, empMap[b.employeeId] || b.employeeId,
            b.scheduledMinutes, b.workedMinutes, b.balanceMinutes, b.type, b.notes,
          ])
          downloadCSV(`banco_horas_${selectedWeek}.csv`, headers, rows)
          break
        }
        case 'colaboradores': {
          const headers = ['Nome', 'Apelido', 'Telefone', 'Funcao', 'Status', 'Custo/Hora (R$)', 'Custo Mensal (R$)']
          const rows = state.employees.map(e => [
            e.name, e.nickname, e.phone, e.role, e.status, e.hourlyRate, e.monthlyCost,
          ])
          downloadCSV('colaboradores.csv', headers, rows)
          break
        }
      }
      setGenerating(null)
    }, 300)
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      {/* Week selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Relatorios</h2>
          <p className="text-sm text-muted-foreground">Exporte dados em CSV para analise externa</p>
        </div>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          {weekOptions.map(w => (
            <option key={w} value={w}>Semana de {new Date(w + 'T00:00:00').toLocaleDateString('pt-BR')}</option>
          ))}
        </select>
      </div>

      {/* Report cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {availableReports.map(report => {
          const Icon = report.icon
          const isGenerating = generating === report.type
          return (
            <button
              key={report.type}
              onClick={() => generate(report.type)}
              disabled={isGenerating}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-card/80 active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground">{report.label}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{report.description}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <FileDown className="h-3.5 w-3.5" />
                  {isGenerating ? 'Gerando...' : 'Baixar CSV'}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Highlights Section ── */}
      <HighlightsSection state={state} selectedWeek={selectedWeek} />

      {/* Info */}
      <div className="rounded-lg border border-border bg-card/50 p-3 text-xs text-muted-foreground">
        Os arquivos CSV podem ser abertos no Excel, Google Sheets ou qualquer ferramenta de planilhas.
        Os dados exportados refletem o estado atual do sistema no momento da geracao.
      </div>
    </div>
  )
}

const LAYER_LABELS: Record<RuleLayer, string> = {
  global: 'Global',
  expeditor: 'Expeditor',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
}

function HighlightsSection({ state, selectedWeek }: {
  state: ReturnType<typeof useApp>['state']
  selectedWeek: string
}) {
  const { violations, highlights } = useMemo(
    () => evaluateRules(state, selectedWeek),
    [state, selectedWeek],
  )

  const positives = highlights.filter(h => h.type === 'positive')
  const negatives = highlights.filter(h => h.type === 'negative')

  if (positives.length === 0 && negatives.length === 0 && violations.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-base font-bold text-foreground">Highlights da Semana</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Positives */}
        {positives.length > 0 && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <ThumbsUp className="h-4 w-4" /> Destaques Positivos
            </div>
            {positives.map((h, i) => (
              <div key={i} className="rounded-lg bg-success/10 px-3 py-2">
                <div className="text-xs font-medium text-foreground">{h.title}</div>
                <div className="text-[11px] text-muted-foreground">{h.description}</div>
                {h.metric !== undefined && (
                  <div className="mt-0.5 text-xs font-bold text-success">
                    {h.metric}{h.unit ? ` ${h.unit}` : ''}
                  </div>
                )}
                <span className="text-[10px] text-success/60">{LAYER_LABELS[h.layer]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Negatives */}
        {negatives.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <ThumbsDown className="h-4 w-4" /> Pontos de Atencao
            </div>
            {negatives.map((h, i) => (
              <div key={i} className="rounded-lg bg-destructive/10 px-3 py-2">
                <div className="text-xs font-medium text-foreground">{h.title}</div>
                <div className="text-[11px] text-muted-foreground">{h.description}</div>
                {h.metric !== undefined && (
                  <div className="mt-0.5 text-xs font-bold text-destructive">
                    {h.metric}{h.unit ? ` ${h.unit}` : ''}
                  </div>
                )}
                <span className="text-[10px] text-destructive/60">{LAYER_LABELS[h.layer]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rule violations summary */}
      {violations.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <Shield className="h-4 w-4" /> {violations.length} Violacao(es) de Regras de Ouro
          </div>
          {violations.slice(0, 5).map(v => (
            <div key={v.id} className="flex items-center gap-2 text-xs">
              <span className={v.severity === 'bloqueante' ? 'text-destructive' : 'text-warning'}>●</span>
              <span className="text-foreground">{v.description}</span>
              <span className="text-muted-foreground">({LAYER_LABELS[v.layer]})</span>
            </div>
          ))}
          {violations.length > 5 && (
            <div className="text-xs text-muted-foreground">+ {violations.length - 5} mais...</div>
          )}
        </div>
      )}
    </div>
  )
}
