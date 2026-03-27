import { useState, useMemo } from 'react'
import {
  Plus,
  Search,
  Phone,
  Edit2,
  Trash2,
  User,
  MessageCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useApp } from '@/store/AppContext'
import { cn, formatCurrency } from '@/lib/utils'
import type { Employee } from '@/types'

// ── Constants ───────────────────────────────────────────────────────────

type StatusFilter = 'todos' | 'ativo' | 'inativo' | 'ferias'

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'success' | 'destructive' | 'warning' }
> = {
  ativo: { label: 'Ativo', variant: 'success' },
  inativo: { label: 'Inativo', variant: 'destructive' },
  ferias: { label: 'Ferias', variant: 'warning' },
}

const ROLE_LABELS: Record<string, string> = {
  auxiliar: 'Auxiliar',
  lider: 'Lider',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativo', label: 'Ativos' },
  { key: 'inativo', label: 'Inativos' },
  { key: 'ferias', label: 'Ferias' },
]

// ── Empty Form State ────────────────────────────────────────────────────

interface EmployeeForm {
  name: string
  nickname: string
  phone: string
  role: Employee['role']
  status: Employee['status']
  hourlyRate: string
  monthlyCost: string
}

const emptyForm: EmployeeForm = {
  name: '',
  nickname: '',
  phone: '',
  role: 'auxiliar',
  status: 'ativo',
  hourlyRate: '',
  monthlyCost: '',
}

function formFromEmployee(e: Employee): EmployeeForm {
  return {
    name: e.name,
    nickname: e.nickname,
    phone: e.phone,
    role: e.role,
    status: e.status,
    hourlyRate: String(e.hourlyRate),
    monthlyCost: String(e.monthlyCost),
  }
}

// ── Component ───────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const { state, dispatch } = useApp()
  const { employees } = state

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)

  // ── Filtering ───────────────────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      todos: employees.length,
      ativo: 0,
      inativo: 0,
      ferias: 0,
    }
    for (const e of employees) {
      if (e.status in counts) counts[e.status as StatusFilter]++
    }
    return counts
  }, [employees])

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const matchSearch =
        search === '' ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.nickname.toLowerCase().includes(search.toLowerCase())
      const matchStatus =
        statusFilter === 'todos' || e.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [employees, search, statusFilter])

  // ── Handlers ────────────────────────────────────────────────────────

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(e: Employee) {
    setEditingId(e.id)
    setForm(formFromEmployee(e))
    setModalOpen(true)
  }

  function handleSave() {
    const hourlyRate = parseFloat(form.hourlyRate) || 0
    const monthlyCost = parseFloat(form.monthlyCost) || 0

    if (!form.name.trim()) return

    if (editingId) {
      dispatch({
        type: 'UPDATE_EMPLOYEE',
        payload: {
          id: editingId,
          name: form.name.trim(),
          nickname: form.nickname.trim() || form.name.trim(),
          phone: form.phone.trim(),
          role: form.role,
          status: form.status,
          hourlyRate,
          monthlyCost,
        },
      })
    } else {
      const id = form.name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') +
        '-' +
        Date.now().toString(36)

      dispatch({
        type: 'ADD_EMPLOYEE',
        payload: {
          id,
          name: form.name.trim(),
          nickname: form.nickname.trim() || form.name.trim(),
          phone: form.phone.trim(),
          role: form.role,
          status: form.status,
          hourlyRate,
          monthlyCost,
        },
      })
    }

    setModalOpen(false)
  }

  function handleDelete() {
    if (!deleteTarget) return
    dispatch({ type: 'DELETE_EMPLOYEE', payload: deleteTarget.id })
    setDeleteTarget(null)
  }

  function openWhatsApp(phone: string) {
    const clean = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${clean}`, '_blank')
  }

  function updateField<K extends keyof EmployeeForm>(
    key: K,
    value: EmployeeForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {employees.length} colaboradores cadastrados
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo Colaborador
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-input py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                statusFilter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                  statusFilter === f.key
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted-foreground/20 text-muted-foreground',
                )}
              >
                {statusCounts[f.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => {
          const status = STATUS_CONFIG[e.status] ?? STATUS_CONFIG.ativo
          return (
            <Card key={e.id} variant="glass" className="space-y-3">
              {/* Top: avatar, name, status */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[e.role] ?? e.role}
                    </p>
                  </div>
                </div>
                <Badge variant={status.variant} size="sm">
                  {status.label}
                </Badge>
              </div>

              {/* Info rows */}
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Valor/Hora</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(e.hourlyRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Custo Mensal</span>
                  <span className="text-xs">
                    {formatCurrency(e.monthlyCost)}
                  </span>
                </div>
              </div>

              {e.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {e.phone}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <button
                  onClick={() => openEdit(e)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => setDeleteTarget(e)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
                {e.phone && (
                  <button
                    onClick={() => openWhatsApp(e.phone)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-success/80 transition-colors hover:bg-success/10 hover:text-success"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          Nenhum colaborador encontrado.
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Colaborador' : 'Novo Colaborador'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Nome */}
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              Nome completo
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Nome do colaborador"
            />
          </div>

          {/* Apelido + Telefone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Apelido
              </label>
              <input
                type="text"
                value={form.nickname}
                onChange={(e) => updateField('nickname', e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Apelido"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="+55 31 9 0000-0000"
              />
            </div>
          </div>

          {/* Cargo + Status */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Cargo
              </label>
              <select
                value={form.role}
                onChange={(e) =>
                  updateField('role', e.target.value as Employee['role'])
                }
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="auxiliar">Auxiliar</option>
                <option value="lider">Lider</option>
                <option value="supervisor">Supervisor</option>
                <option value="gerente">Gerente</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  updateField('status', e.target.value as Employee['status'])
                }
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="ferias">Ferias</option>
              </select>
            </div>
          </div>

          {/* Valor/Hora + Custo Mensal */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Valor/Hora (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.hourlyRate}
                onChange={(e) => updateField('hourlyRate', e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Custo Mensal (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.monthlyCost}
                onChange={(e) => updateField('monthlyCost', e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim()}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ────────────────────────────────── */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir Colaborador"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir{' '}
            <span className="font-semibold text-foreground">
              {deleteTarget?.name}
            </span>
            ? Esta acao nao pode ser desfeita.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              className="rounded-lg bg-destructive px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-destructive/90"
            >
              <span className="inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Excluir
              </span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
