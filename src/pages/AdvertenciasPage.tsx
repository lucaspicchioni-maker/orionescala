import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, Plus, Trash2, Filter } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { useApp } from '@/store/AppContext'
import { cn, todayBR } from '@/lib/utils'

interface Warning {
  id: string
  employeeId: string
  date: string
  type: 'verbal' | 'written' | 'suspension' | 'termination'
  description: string
  witness: string
  actionTaken: string
  createdBy: string
  createdAt: string
}

const TYPE_CONFIG: Record<string, { label: string; variant: 'muted' | 'warning' | 'destructive' | 'default' }> = {
  verbal: { label: 'Verbal', variant: 'muted' },
  written: { label: 'Escrita', variant: 'warning' },
  suspension: { label: 'Suspensão', variant: 'destructive' },
  termination: { label: 'Desligamento', variant: 'destructive' },
}

export default function AdvertenciasPage() {
  const { state } = useApp()
  const { toast } = useToast()
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [form, setForm] = useState({
    employeeId: '', date: todayBR(), type: 'verbal',
    description: '', witness: '', actionTaken: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Warning[]>('/api/warnings')
      .then(setWarnings)
      .catch(() => toast('error', 'Erro ao carregar advertências'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() =>
    filterEmployee ? warnings.filter(w => w.employeeId === filterEmployee) : warnings,
    [warnings, filterEmployee],
  )

  const empMap = useMemo(() => {
    const m = new Map<string, string>()
    state.employees.forEach(e => m.set(e.id, e.name))
    return m
  }, [state.employees])

  async function handleSave() {
    if (!form.employeeId || !form.description) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>('/api/warnings', form)
      setWarnings(prev => [{
        id: res.id, ...form, type: form.type as Warning['type'],
        createdBy: state.currentUser.name, createdAt: new Date().toISOString(),
      }, ...prev])
      setModalOpen(false)
      setForm({ employeeId: '', date: todayBR(), type: 'verbal', description: '', witness: '', actionTaken: '' })
      toast('success', 'Advertência registrada')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta advertência permanentemente?')) return
    try {
      await api.del(`/api/warnings/${id}`)
      setWarnings(prev => prev.filter(w => w.id !== id))
      toast('success', 'Removida')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao remover')
    }
  }

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <AlertTriangle className="h-6 w-6 text-warning" />
            Advertências
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registro de conversas, fatos e ações disciplinares. Rastro legal para auditoria.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nova Advertência
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}
          className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos os colaboradores</option>
          {state.employees.filter(e => e.status === 'ativo').map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} registro(s)</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma advertência registrada.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(w => {
            const cfg = TYPE_CONFIG[w.type] || TYPE_CONFIG.verbal
            return (
              <Card key={w.id} variant="glass" className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                    <span className="font-semibold text-foreground">{empMap.get(w.employeeId) || w.employeeId}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(w.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{w.description}</p>
                  {w.witness && <p className="mt-0.5 text-xs text-muted-foreground">Testemunha: {w.witness}</p>}
                  {w.actionTaken && <p className="mt-0.5 text-xs text-muted-foreground">Ação: {w.actionTaken}</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground">por {w.createdBy}</p>
                </div>
                {state.currentUser.role === 'admin' && (
                  <button onClick={() => void handleDelete(w.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Registrar Advertência">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Colaborador</label>
            <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Selecione...</option>
              {state.employees.filter(e => e.status === 'ativo').map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="verbal">Verbal</option>
                <option value="written">Escrita</option>
                <option value="suspension">Suspensão</option>
                <option value="termination">Desligamento</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição do fato</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3} className="w-full resize-none rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Descreva o fato ocorrido com detalhes..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Testemunha (opcional)</label>
              <input type="text" value={form.witness} onChange={e => setForm(p => ({ ...p, witness: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Ação tomada (opcional)</label>
              <input type="text" value={form.actionTaken} onChange={e => setForm(p => ({ ...p, actionTaken: e.target.value }))}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)}
              className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
              Cancelar
            </button>
            <button onClick={() => void handleSave()}
              disabled={saving || !form.employeeId || !form.description}
              className={cn('flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40')}>
              {saving ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
