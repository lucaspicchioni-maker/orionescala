import { useState, useEffect, useMemo } from 'react'
import { Plus, Palmtree, Check, X, Clock, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import type { VacationRequest } from '@/types'

function calcDays(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
}

function calcSaldoDias(admissionDate: string | undefined, approved: VacationRequest[]): number {
  if (!admissionDate) return 0
  const days = Math.floor((Date.now() - new Date(admissionDate).getTime()) / 86400000)
  const earned = Math.floor((days / 365) * 30)
  const used = approved.filter(v => v.status === 'approved').reduce((s, v) => s + v.days, 0)
  return Math.max(0, earned - used)
}

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  pending: { label: 'Aguardando', variant: 'warning' },
  approved: { label: 'Aprovado', variant: 'success' },
  rejected: { label: 'Recusado', variant: 'destructive' },
}

export default function VacoesPage() {
  const { state } = useApp()
  const { toast } = useToast()
  const role = state.currentUser.role
  const isManager = role === 'admin' || role === 'gerente' || role === 'rh'

  const [requests, setRequests] = useState<VacationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ employeeId: '', startDate: '', endDate: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const myEmployee = state.employees.find(e => e.id === state.currentUser.employeeId)

  useEffect(() => {
    api.get<VacationRequest[]>('/api/vacations')
      .then(setRequests)
      .catch(() => toast('error', 'Erro ao carregar férias'))
      .finally(() => setLoading(false))
  }, [])

  const myRequests = useMemo(() =>
    isManager ? requests : requests.filter(r => r.employeeId === state.currentUser.employeeId),
    [requests, isManager, state.currentUser.employeeId]
  )

  const saldo = useMemo(() => {
    if (isManager) return null
    return calcSaldoDias(myEmployee?.admissionDate, requests.filter(r => r.employeeId === state.currentUser.employeeId))
  }, [myEmployee, requests, isManager, state.currentUser.employeeId])

  const days = form.startDate && form.endDate ? calcDays(form.startDate, form.endDate) : 0

  async function handleSave() {
    const employeeId = isManager ? form.employeeId : (state.currentUser.employeeId || '')
    if (!employeeId || !form.startDate || !form.endDate) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>('/api/vacations', {
        employeeId, startDate: form.startDate, endDate: form.endDate,
        days: calcDays(form.startDate, form.endDate), notes: form.notes,
      })
      const emp = state.employees.find(e => e.id === employeeId)
      const newReq: VacationRequest = {
        id: res.id, employeeId, startDate: form.startDate, endDate: form.endDate,
        days: calcDays(form.startDate, form.endDate), status: 'pending',
        requestedBy: state.currentUser.name, approvedBy: null,
        notes: form.notes, createdAt: new Date().toISOString(),
      }
      setRequests(prev => [newReq, ...prev])
      setModalOpen(false)
      setForm({ employeeId: '', startDate: '', endDate: '', notes: '' })
      toast('success', `Férias solicitadas para ${emp?.name || 'colaborador'}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao solicitar férias')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: string, action: 'approve' | 'reject') {
    try {
      await api.put(`/api/vacations/${id}/${action}`, {})
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected', approvedBy: state.currentUser.name } : r))
      toast('success', action === 'approve' ? 'Férias aprovadas' : 'Férias recusadas')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Férias</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isManager ? `${requests.length} solicitações` : saldo !== null ? `Saldo: ${saldo} dias disponíveis` : ''}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Solicitar Férias
        </button>
      </div>

      {!isManager && saldo !== null && (
        <Card variant="glass" className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Palmtree className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Saldo de férias disponível</p>
            <p className="text-3xl font-bold text-foreground">{saldo} <span className="text-base font-normal text-muted-foreground">dias</span></p>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : myRequests.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">Nenhuma solicitação encontrada.</div>
      ) : (
        <div className="space-y-3">
          {myRequests.map(req => {
            const emp = state.employees.find(e => e.id === req.employeeId)
            const st = STATUS[req.status] ?? STATUS.pending
            return (
              <Card key={req.id} variant="glass" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    {isManager && <p className="font-semibold text-foreground">{emp?.name ?? req.employeeId}</p>}
                    <p className="text-sm text-muted-foreground">
                      {new Date(req.startDate).toLocaleDateString('pt-BR')} até {new Date(req.endDate).toLocaleDateString('pt-BR')}
                      <span className="ml-2 font-medium text-foreground">{req.days} dias</span>
                    </p>
                    {req.notes && <p className="text-xs text-muted-foreground">{req.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={st.variant} size="sm">{st.label}</Badge>
                  {isManager && req.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(req.id, 'approve')}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-success hover:bg-success/10 transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </button>
                      <button
                        onClick={() => updateStatus(req.id, 'reject')}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" /> Recusar
                      </button>
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Solicitar Férias" size="sm">
        <div className="space-y-4">
          {isManager && (
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Colaborador</label>
              <select
                value={form.employeeId}
                onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Selecione...</option>
                {state.employees.filter(e => e.status === 'ativo').map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Início</label>
              <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Fim</label>
              <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          {days > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-foreground font-medium">{days} dias corridos</span>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Observações (opcional)</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
              className="w-full resize-none rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || !form.startDate || !form.endDate || (isManager && !form.employeeId)}
              className={cn('flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors',
                'bg-primary hover:bg-primary/90 disabled:opacity-40')}
            >
              {saving ? 'Salvando...' : 'Solicitar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
