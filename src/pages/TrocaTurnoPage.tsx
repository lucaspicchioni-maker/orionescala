import { useState, useMemo, useEffect } from 'react'
import { useApp } from '@/store/AppContext'
import { ArrowLeftRight, Check, X, Clock, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { ShiftSwapRequest } from '@/types'

export default function TrocaTurnoPage() {
  const { state, dispatch } = useApp()
  const role = state.currentUser.role
  const loggedEmployeeId = localStorage.getItem('orion_logged_employee') || ''
  const [showNewRequest, setShowNewRequest] = useState(false)

  // Form state
  const [targetId, setTargetId] = useState('')
  const [swapDate, setSwapDate] = useState('')
  const [myShift, setMyShift] = useState('')
  const [theirShift, setTheirShift] = useState('')
  const [reason, setReason] = useState('')

  const activeEmployees = state.employees.filter(e => e.status === 'ativo' && e.id !== loggedEmployeeId)

  // Load from API on mount
  useEffect(() => {
    api.get<ShiftSwapRequest[]>('/api/shift-swaps')
      .then(data => dispatch({ type: 'SET_SHIFT_SWAPS', payload: data }))
      .catch(() => {})
  }, [dispatch])
  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    state.employees.forEach(e => { m[e.id] = e.name })
    return m
  }, [state.employees])

  // Filter swaps based on role
  const visibleSwaps = useMemo(() => {
    if (role === 'colaborador') {
      return state.shiftSwaps.filter(s => s.requesterId === loggedEmployeeId || s.targetId === loggedEmployeeId)
    }
    return [...state.shiftSwaps].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [state.shiftSwaps, role, loggedEmployeeId])

  const pendingCount = visibleSwaps.filter(s => s.status === 'pending').length

  async function submitRequest() {
    if (!targetId || !swapDate || !myShift || !theirShift) return

    const request: ShiftSwapRequest = {
      id: crypto.randomUUID(),
      requesterId: loggedEmployeeId,
      targetId,
      date: swapDate,
      requesterShift: myShift,
      targetShift: theirShift,
      reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
    }

    try {
      await api.post('/api/shift-swaps', request)
      const fresh = await api.get<ShiftSwapRequest[]>('/api/shift-swaps')
      dispatch({ type: 'SET_SHIFT_SWAPS', payload: fresh })
    } catch {
      dispatch({ type: 'ADD_SHIFT_SWAP', payload: request })
    }
    setShowNewRequest(false)
    setTargetId('')
    setSwapDate('')
    setMyShift('')
    setTheirShift('')
    setReason('')
  }

  async function resolveSwap(swapId: string, status: 'accepted' | 'rejected') {
    const swap = state.shiftSwaps.find(s => s.id === swapId)
    if (!swap) return

    try {
      await api.put(`/api/shift-swaps/${swapId}/resolve`, { status })
      const fresh = await api.get<ShiftSwapRequest[]>('/api/shift-swaps')
      dispatch({ type: 'SET_SHIFT_SWAPS', payload: fresh })
    } catch {
      dispatch({
        type: 'UPDATE_SHIFT_SWAP',
        payload: {
          ...swap,
          status,
          resolvedAt: new Date().toISOString(),
          resolvedBy: loggedEmployeeId,
        },
      })
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    accepted: 'bg-success/20 text-success',
    rejected: 'bg-destructive/20 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  }
  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    accepted: 'Aprovada',
    rejected: 'Rejeitada',
    cancelled: 'Cancelada',
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Troca de Turno</h2>
          <p className="text-sm text-muted-foreground">
            {role === 'colaborador' ? 'Solicite troca com outro colaborador' : `${pendingCount} solicitacoes pendentes`}
          </p>
        </div>
        {role === 'colaborador' && (
          <button
            onClick={() => setShowNewRequest(!showNewRequest)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Troca</span>
          </button>
        )}
      </div>

      {/* New request form */}
      {showNewRequest && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Solicitar Troca</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Trocar com</label>
              <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                <option value="">Selecione</option>
                {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Data</label>
              <input type="date" value={swapDate} onChange={e => setSwapDate(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Meu turno</label>
              <input type="text" placeholder="09:00-15:00" value={myShift} onChange={e => setMyShift(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Turno dele(a)</label>
              <input type="text" placeholder="15:00-22:00" value={theirShift} onChange={e => setTheirShift(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Motivo (opcional)</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: consulta medica" className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground" />
          </div>
          <div className="flex gap-2">
            <button onClick={submitRequest} disabled={!targetId || !swapDate || !myShift || !theirShift} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Enviar Solicitacao
            </button>
            <button onClick={() => setShowNewRequest(false)} className="rounded-lg bg-secondary px-4 py-2 text-sm text-foreground">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Swaps list */}
      {visibleSwaps.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          <ArrowLeftRight className="mx-auto mb-2 h-8 w-8 opacity-30" />
          Nenhuma solicitacao de troca
        </div>
      ) : (
        <div className="space-y-2">
          {visibleSwaps.map(swap => (
            <div key={swap.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5 text-accent" />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {empMap[swap.requesterId]} <span className="text-muted-foreground">↔</span> {empMap[swap.targetId]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(swap.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      {' · '}{swap.requesterShift} ↔ {swap.targetShift}
                    </div>
                    {swap.reason && <div className="mt-0.5 text-xs text-muted-foreground italic">"{swap.reason}"</div>}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColors[swap.status]}`}>
                  {statusLabels[swap.status]}
                </span>
              </div>

              {/* Actions for supervisor/gerente on pending swaps */}
              {swap.status === 'pending' && role !== 'colaborador' && (
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <button
                    onClick={() => resolveSwap(swap.id, 'accepted')}
                    className="flex items-center gap-1 rounded-lg bg-success/20 px-3 py-1.5 text-xs font-medium text-success"
                  >
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </button>
                  <button
                    onClick={() => resolveSwap(swap.id, 'rejected')}
                    className="flex items-center gap-1 rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive"
                  >
                    <X className="h-3.5 w-3.5" /> Rejeitar
                  </button>
                </div>
              )}

              {/* Cancel for requester */}
              {swap.status === 'pending' && swap.requesterId === loggedEmployeeId && (
                <div className="mt-3 border-t border-border pt-3">
                  <button
                    onClick={() => resolveSwap(swap.id, 'cancelled' as 'rejected')}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Cancelar solicitacao
                  </button>
                </div>
              )}

              <div className="mt-2 text-[11px] text-muted-foreground">
                <Clock className="mr-1 inline h-3 w-3" />
                {new Date(swap.createdAt).toLocaleDateString('pt-BR')} {new Date(swap.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {swap.resolvedAt && ` · Resolvido ${new Date(swap.resolvedAt).toLocaleDateString('pt-BR')}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
