import { useState, useEffect, useMemo } from 'react'
import { Plus, AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/store/AppContext'
import type { EPIRecord } from '@/types'

const EPI_TYPES = [
  { value: 'capacete', label: 'Capacete' },
  { value: 'bota', label: 'Bota de Segurança' },
  { value: 'luva', label: 'Luva' },
  { value: 'oculos', label: 'Óculos de Proteção' },
  { value: 'colete', label: 'Colete Refletivo' },
  { value: 'protetor_auricular', label: 'Protetor Auricular' },
  { value: 'mascara', label: 'Máscara' },
  { value: 'cinto', label: 'Cinto de Segurança' },
  { value: 'avental', label: 'Avental' },
  { value: 'outro', label: 'Outro' },
]

function getEpiStatus(epi: EPIRecord): { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' } {
  if (epi.returnedAt) return { label: 'Devolvido', variant: 'muted' }
  if (!epi.expiresAt) return { label: 'Ativo', variant: 'success' }
  const expires = new Date(epi.expiresAt)
  const now = new Date()
  const diffDays = Math.ceil((expires.getTime() - now.getTime()) / 86400000)
  if (diffDays < 0) return { label: 'Vencido', variant: 'destructive' }
  if (diffDays <= 30) return { label: `Vence em ${diffDays}d`, variant: 'warning' }
  return { label: 'Ativo', variant: 'success' }
}

const emptyForm = { employeeId: '', name: '', type: '', deliveredAt: '', expiresAt: '', notes: '' }

export default function EPIsPage() {
  const { state } = useApp()
  const { toast } = useToast()

  const [epiList, setEpiList] = useState<EPIRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [returnTarget, setReturnTarget] = useState<EPIRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EPIRecord | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<EPIRecord[]>('/api/epis')
      .then(setEpiList)
      .catch(() => toast('error', 'Erro ao carregar EPIs'))
      .finally(() => setLoading(false))
  }, [])

  const expiring = useMemo(() =>
    epiList.filter(e => {
      if (e.returnedAt || !e.expiresAt) return false
      const diff = Math.ceil((new Date(e.expiresAt).getTime() - Date.now()) / 86400000)
      return diff <= 30
    }),
    [epiList]
  )

  const filtered = useMemo(() =>
    filterEmployee ? epiList.filter(e => e.employeeId === filterEmployee) : epiList,
    [epiList, filterEmployee]
  )

  async function handleSave() {
    if (!form.employeeId || !form.name || !form.type || !form.deliveredAt) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>('/api/epis', form)
      const newEpi: EPIRecord = {
        id: res.id, ...form,
        expiresAt: form.expiresAt || null,
        returnedAt: null,
        createdAt: new Date().toISOString(),
      }
      setEpiList(prev => [newEpi, ...prev])
      setModalOpen(false)
      setForm(emptyForm)
      toast('success', 'EPI registrado com sucesso')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleReturn() {
    if (!returnTarget) return
    try {
      const today = new Date().toISOString().split('T')[0]
      await api.put(`/api/epis/${returnTarget.id}`, { ...returnTarget, returnedAt: today })
      setEpiList(prev => prev.map(e => e.id === returnTarget.id ? { ...e, returnedAt: today } : e))
      setReturnTarget(null)
      toast('success', 'Devolução registrada')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao registrar devolução')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await api.del(`/api/epis/${deleteTarget.id}`)
      setEpiList(prev => prev.filter(e => e.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast('success', 'EPI removido')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao remover')
    }
  }

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Controle de EPIs</h1>
          <p className="mt-1 text-sm text-muted-foreground">{epiList.filter(e => !e.returnedAt).length} ativos</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Registrar Entrega
        </button>
      </div>

      {expiring.length > 0 && (
        <Card variant="glass" className="border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-sm font-semibold text-warning">{expiring.length} EPI(s) vencendo em 30 dias</span>
          </div>
          <div className="space-y-1">
            {expiring.map(e => {
              const emp = state.employees.find(emp => emp.id === e.employeeId)
              return (
                <p key={e.id} className="text-xs text-muted-foreground">
                  {emp?.name ?? e.employeeId} — {e.name} (vence {e.expiresAt ? new Date(e.expiresAt).toLocaleDateString('pt-BR') : '?'})
                </p>
              )
            })}
          </div>
        </Card>
      )}

      <div>
        <select
          value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}
          className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos os colaboradores</option>
          {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">Nenhum EPI encontrado.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Colaborador</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">EPI</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Entregue</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Vencimento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(epi => {
                const emp = state.employees.find(e => e.id === epi.employeeId)
                const status = getEpiStatus(epi)
                return (
                  <tr key={epi.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{emp?.name ?? epi.employeeId}</td>
                    <td className="px-4 py-3 text-muted-foreground">{epi.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(epi.deliveredAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {epi.expiresAt ? new Date(epi.expiresAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={status.variant} size="sm">{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!epi.returnedAt && (
                          <button onClick={() => setReturnTarget(epi)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <RotateCcw className="h-3 w-3" /> Devolver
                          </button>
                        )}
                        <button onClick={() => setDeleteTarget(epi)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal registrar entrega */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Registrar Entrega de EPI">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Colaborador</label>
            <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Selecione...</option>
              {state.employees.filter(e => e.status === 'ativo').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">EPI</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Bota de Segurança"
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Selecione...</option>
                {EPI_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Data de Entrega</label>
              <input type="date" value={form.deliveredAt} onChange={e => setForm(p => ({ ...p, deliveredAt: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Vencimento (opcional)</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Observações</label>
            <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="CA, tamanho, etc."
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
            <button onClick={() => void handleSave()} disabled={saving || !form.employeeId || !form.name || !form.type || !form.deliveredAt}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {saving ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal devolução */}
      <Modal isOpen={!!returnTarget} onClose={() => setReturnTarget(null)} title="Registrar Devolução" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirmar devolução de <span className="font-semibold text-foreground">{returnTarget?.name}</span> por{' '}
            <span className="font-semibold text-foreground">
              {state.employees.find(e => e.id === returnTarget?.employeeId)?.name}
            </span>?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setReturnTarget(null)}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
            <button onClick={() => void handleReturn()}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">Confirmar</button>
          </div>
        </div>
      </Modal>

      {/* Modal excluir */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remover EPI" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Remover o registro de <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
            <button onClick={() => void handleDelete()}
              className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white hover:bg-destructive/90 transition-colors">
              <span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Remover</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
