import { useState, useMemo, useEffect } from 'react'
import { useApp } from '@/store/AppContext'
import { Clock, TrendingUp, TrendingDown, Minus, Plus, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { BancoHorasEntry } from '@/types'

export default function BancoHorasPage() {
  const { state, dispatch } = useApp()
  const role = state.currentUser.role
  const loggedEmployeeId = localStorage.getItem('orion_logged_employee') || ''
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjEmployee, setAdjEmployee] = useState('')
  const [adjMinutes, setAdjMinutes] = useState('')
  const [adjNotes, setAdjNotes] = useState('')

  const activeEmployees = state.employees.filter(e => e.status === 'ativo')

  // Load from API on mount
  useEffect(() => {
    api.get<BancoHorasEntry[]>(`/api/banco-horas/week/${state.currentWeek}`)
      .then(data => dispatch({ type: 'SET_BANCO_HORAS', payload: data }))
      .catch(() => {})
  }, [state.currentWeek, dispatch])

  // Calculate banco de horas from ponto records + manual entries
  const employeeBalances = useMemo(() => {
    const balances: Record<string, { scheduled: number; worked: number; balance: number; adjustments: number; entries: number }> = {}

    // Initialize
    activeEmployees.forEach(e => {
      balances[e.id] = { scheduled: 0, worked: 0, balance: 0, adjustments: 0, entries: 0 }
    })

    // From ponto records
    state.pontoRecords.forEach(p => {
      if (!balances[p.employeeId]) return
      const scheduled = p.scheduledStart && p.scheduledEnd
        ? ((parseInt(p.scheduledEnd.split(':')[0]) - parseInt(p.scheduledStart.split(':')[0])) * 60)
        : 0
      balances[p.employeeId].scheduled += scheduled
      balances[p.employeeId].worked += p.workedMinutes
      balances[p.employeeId].entries++
    })

    // From banco horas entries (manual adjustments)
    state.bancoHoras.forEach(b => {
      if (!balances[b.employeeId]) return
      if (b.type === 'adjustment') {
        balances[b.employeeId].adjustments += b.balanceMinutes
      }
    })

    // Calculate balance
    Object.keys(balances).forEach(id => {
      const b = balances[id]
      b.balance = (b.worked - b.scheduled) + b.adjustments
    })

    return balances
  }, [activeEmployees, state.pontoRecords, state.bancoHoras])

  // For colaborador, show only their balance
  const visibleEmployees = role === 'colaborador'
    ? activeEmployees.filter(e => e.id === loggedEmployeeId)
    : activeEmployees

  function formatMinutes(mins: number): string {
    const sign = mins >= 0 ? '+' : '-'
    const abs = Math.abs(mins)
    const h = Math.floor(abs / 60)
    const m = abs % 60
    return `${sign}${h}h${String(m).padStart(2, '0')}min`
  }

  async function submitAdjustment() {
    if (!adjEmployee || !adjMinutes) return
    const mins = parseInt(adjMinutes)
    if (isNaN(mins)) return

    const entry: BancoHorasEntry = {
      id: crypto.randomUUID(),
      employeeId: adjEmployee,
      date: new Date().toISOString().split('T')[0],
      weekStart: state.currentWeek,
      scheduledMinutes: 0,
      workedMinutes: 0,
      balanceMinutes: mins,
      type: 'adjustment',
      notes: adjNotes || 'Ajuste manual',
    }

    try {
      await api.post('/api/banco-horas', entry)
      const fresh = await api.get<BancoHorasEntry[]>(`/api/banco-horas/week/${state.currentWeek}`)
      dispatch({ type: 'SET_BANCO_HORAS', payload: fresh })
    } catch {
      dispatch({ type: 'ADD_BANCO_HORAS', payload: entry })
    }
    setShowAdjust(false)
    setAdjEmployee('')
    setAdjMinutes('')
    setAdjNotes('')
  }

  // Recent adjustments
  const recentAdjustments = useMemo(() => {
    return state.bancoHoras
      .filter(b => b.type === 'adjustment')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
  }, [state.bancoHoras])

  // Sync from ponto records (auto-generate entries)
  async function syncFromPonto() {
    const existing = new Set(state.bancoHoras.filter(b => b.type === 'regular').map(b => `${b.employeeId}-${b.date}`))

    const entries: BancoHorasEntry[] = []
    state.pontoRecords.forEach(p => {
      const key = `${p.employeeId}-${p.date}`
      if (existing.has(key)) return
      if (!p.scheduledStart || !p.scheduledEnd) return

      const scheduled = (parseInt(p.scheduledEnd.split(':')[0]) - parseInt(p.scheduledStart.split(':')[0])) * 60
      entries.push({
        id: crypto.randomUUID(),
        employeeId: p.employeeId,
        date: p.date,
        weekStart: state.currentWeek,
        scheduledMinutes: scheduled,
        workedMinutes: p.workedMinutes,
        balanceMinutes: p.workedMinutes - scheduled,
        type: 'regular',
        notes: '',
      })
    })

    for (const entry of entries) {
      try {
        await api.post('/api/banco-horas', entry)
      } catch {
        dispatch({ type: 'ADD_BANCO_HORAS', payload: entry })
      }
    }

    if (entries.length > 0) {
      try {
        const fresh = await api.get<BancoHorasEntry[]>(`/api/banco-horas/week/${state.currentWeek}`)
        dispatch({ type: 'SET_BANCO_HORAS', payload: fresh })
      } catch {
        // already dispatched individually above
      }
    }
  }

  const totalTeamBalance = Object.values(employeeBalances).reduce((s, b) => s + b.balance, 0)

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Banco de Horas</h2>
          <p className="text-sm text-muted-foreground">Controle de horas extras e deficit</p>
        </div>
        {role !== 'colaborador' && (
          <div className="flex gap-2">
            <button onClick={syncFromPonto} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs text-foreground">
              <RefreshCw className="h-3.5 w-3.5" /> Sincronizar
            </button>
            <button onClick={() => setShowAdjust(!showAdjust)} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
              <Plus className="h-3.5 w-3.5" /> Ajuste
            </button>
          </div>
        )}
      </div>

      {/* Team summary (leader/gerente) */}
      {role !== 'colaborador' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <div className="text-xl font-bold text-foreground">{visibleEmployees.length}</div>
            <div className="text-[11px] text-muted-foreground">Colaboradores</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <div className={`text-xl font-bold ${totalTeamBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatMinutes(totalTeamBalance)}
            </div>
            <div className="text-[11px] text-muted-foreground">Saldo Total</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <div className="text-xl font-bold text-success">
              {Object.values(employeeBalances).filter(b => b.balance > 0).length}
            </div>
            <div className="text-[11px] text-muted-foreground">Com extras</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <div className="text-xl font-bold text-destructive">
              {Object.values(employeeBalances).filter(b => b.balance < 0).length}
            </div>
            <div className="text-[11px] text-muted-foreground">Com deficit</div>
          </div>
        </div>
      )}

      {/* Adjustment form */}
      {showAdjust && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Ajuste Manual</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <select value={adjEmployee} onChange={e => setAdjEmployee(e.target.value)} className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
              <option value="">Colaborador</option>
              {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input type="number" value={adjMinutes} onChange={e => setAdjMinutes(e.target.value)} placeholder="Minutos (+/-)" className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
            <input type="text" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="Motivo" className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
          </div>
          <button onClick={submitAdjustment} disabled={!adjEmployee || !adjMinutes} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Salvar Ajuste
          </button>
        </div>
      )}

      {/* Employee balances */}
      <div className="space-y-2">
        {visibleEmployees.map(emp => {
          const bal = employeeBalances[emp.id]
          if (!bal) return null
          const BalIcon = bal.balance > 0 ? TrendingUp : bal.balance < 0 ? TrendingDown : Minus
          const balColor = bal.balance > 0 ? 'text-success' : bal.balance < 0 ? 'text-destructive' : 'text-muted-foreground'

          return (
            <div key={emp.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-bold text-foreground">
                {emp.nickname?.[0] || emp.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{emp.name}</div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>Escalado: {Math.floor(bal.scheduled / 60)}h</span>
                  <span>Trabalhado: {Math.floor(bal.worked / 60)}h</span>
                  <span>{bal.entries} registros</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-right">
                <BalIcon className={`h-4 w-4 ${balColor}`} />
                <div>
                  <div className={`text-sm font-bold ${balColor}`}>{formatMinutes(bal.balance)}</div>
                  {bal.adjustments !== 0 && (
                    <div className="text-[10px] text-muted-foreground">({formatMinutes(bal.adjustments)} ajuste)</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent adjustments */}
      {role !== 'colaborador' && recentAdjustments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Ajustes Recentes</h3>
          <div className="space-y-1">
            {recentAdjustments.map(adj => (
              <div key={adj.id} className="flex items-center justify-between rounded-lg bg-card/50 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-foreground">{state.employees.find(e => e.id === adj.employeeId)?.name}</span>
                  <span className="text-muted-foreground">{adj.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{adj.notes}</span>
                  <span className={adj.balanceMinutes >= 0 ? 'text-success font-medium' : 'text-destructive font-medium'}>
                    {formatMinutes(adj.balanceMinutes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
