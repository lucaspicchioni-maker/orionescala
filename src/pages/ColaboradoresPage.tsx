import { useState, useMemo, useEffect } from 'react'
import {
  Plus,
  Search,
  Phone,
  Edit2,
  Trash2,
  User,
  MessageCircle,
  KeyRound,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
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
  email: string
  cpf: string
  rg: string
  ctps: string
  pis: string
  role: Employee['role']
  status: Employee['status']
  admissionDate: string
  terminationDate: string
  contractType: string
  hourlyRate: string
  monthlyCost: string
  address: string
  bankAccount: string
  emergencyContact: string
  notes: string
}

const emptyForm: EmployeeForm = {
  name: '',
  nickname: '',
  phone: '',
  email: '',
  cpf: '',
  rg: '',
  ctps: '',
  pis: '',
  role: 'auxiliar',
  status: 'ativo',
  admissionDate: '',
  terminationDate: '',
  contractType: '',
  hourlyRate: '',
  monthlyCost: '',
  address: '',
  bankAccount: '',
  emergencyContact: '',
  notes: '',
}

function formFromEmployee(e: Employee): EmployeeForm {
  return {
    name: e.name,
    nickname: e.nickname,
    phone: e.phone,
    email: e.email ?? '',
    cpf: e.cpf ?? '',
    rg: e.rg ?? '',
    ctps: e.ctps ?? '',
    pis: e.pis ?? '',
    role: e.role,
    status: e.status,
    admissionDate: e.admissionDate ?? '',
    terminationDate: e.terminationDate ?? '',
    contractType: e.contractType ?? '',
    hourlyRate: String(e.hourlyRate),
    monthlyCost: String(e.monthlyCost),
    address: e.address ?? '',
    bankAccount: e.bankAccount ?? '',
    emergencyContact: e.emergencyContact ?? '',
    notes: e.notes ?? '',
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
  const [modalTab, setModalTab] = useState<'pessoal' | 'contrato' | 'outros' | 'advertencias'>('pessoal')

  // Advertências do colaborador sendo editado
  type Warning = { id: string; date: string; type: string; description: string; witness: string; actionTaken: string; createdBy: string }
  const [warnings, setWarnings] = useState<Warning[]>([])
  useEffect(() => {
    if (modalTab === 'advertencias' && editingId) {
      api.get<Warning[]>(`/api/warnings?employeeId=${editingId}`)
        .then(setWarnings)
        .catch(() => setWarnings([]))
    }
  }, [modalTab, editingId])

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [loginTarget, setLoginTarget] = useState<Employee | null>(null)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const { toast } = useToast()

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
    setModalTab('pessoal')
    setModalOpen(true)
  }

  function openEdit(e: Employee) {
    setEditingId(e.id)
    setForm(formFromEmployee(e))
    setModalTab('pessoal')
    setModalOpen(true)
  }

  async function handleSave() {
    const hourlyRate = parseFloat(form.hourlyRate) || 0
    const monthlyCost = parseFloat(form.monthlyCost) || 0

    if (!form.name.trim()) return

    const extraFields = {
      email: form.email.trim() || undefined,
      cpf: form.cpf.trim() || undefined,
      rg: form.rg.trim() || undefined,
      ctps: form.ctps.trim() || undefined,
      pis: form.pis.trim() || undefined,
      admissionDate: form.admissionDate || undefined,
      terminationDate: form.terminationDate || undefined,
      contractType: (form.contractType as Employee['contractType']) || undefined,
      address: form.address.trim() || undefined,
      bankAccount: form.bankAccount.trim() || undefined,
      emergencyContact: form.emergencyContact.trim() || undefined,
      notes: form.notes.trim() || undefined,
    }

    const payload = {
      name: form.name.trim(),
      nickname: form.nickname.trim() || form.name.trim(),
      phone: form.phone.trim(),
      role: form.role,
      status: form.status,
      hourlyRate,
      monthlyCost,
      ...extraFields,
    }

    try {
      if (editingId) {
        const updated = await api.put<Employee>(`/api/employees/${editingId}`, payload)
        dispatch({ type: 'UPDATE_EMPLOYEE', payload: updated })
      } else {
        const created = await api.post<Employee>('/api/employees', payload)
        dispatch({ type: 'ADD_EMPLOYEE', payload: created })
      }
      setModalOpen(false)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao salvar colaborador')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await api.del(`/api/employees/${deleteTarget.id}`)
      dispatch({ type: 'DELETE_EMPLOYEE', payload: deleteTarget.id })
      setDeleteTarget(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao excluir colaborador')
    }
  }

  function openWhatsApp(phone: string) {
    const clean = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${clean}`, '_blank')
  }

  async function createLogin() {
    if (!loginTarget || loginPassword.length < 4) return
    setLoginSubmitting(true)
    try {
      await api.post('/api/users', {
        name: loginTarget.nickname || loginTarget.name,
        role: 'colaborador',
        password: loginPassword,
        employeeId: loginTarget.id,
      })
      toast('success', `Login criado para ${loginTarget.nickname || loginTarget.name}`)
      setLoginTarget(null)
      setLoginPassword('')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao criar login')
    } finally {
      setLoginSubmitting(false)
    }
  }

  function updateField<K extends keyof EmployeeForm>(
    key: K,
    value: EmployeeForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
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
                  onClick={() => { setLoginTarget(e); setLoginPassword('') }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  title="Criar login para o colaborador"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Login
                </button>
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
          {/* Tab navigation */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {([
              { key: 'pessoal', label: 'Dados Pessoais' },
              { key: 'contrato', label: 'Contrato' },
              { key: 'outros', label: 'Endereco / Outros' },
              ...(editingId ? [{ key: 'advertencias', label: 'Advertências' }] : []),
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setModalTab(tab.key as 'pessoal' | 'contrato' | 'outros' | 'advertencias')}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  modalTab === tab.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Dados Pessoais ────────────────────────────────── */}
          {modalTab === 'pessoal' && (
            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Nome completo</label>
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
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Apelido</label>
                  <input
                    type="text"
                    value={form.nickname}
                    onChange={(e) => updateField('nickname', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Apelido"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="+55 31 9 0000-0000"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="email@exemplo.com"
                />
              </div>

              {/* CPF + RG */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">CPF</label>
                  <input
                    type="text"
                    value={form.cpf}
                    onChange={(e) => updateField('cpf', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">RG</label>
                  <input
                    type="text"
                    value={form.rg}
                    onChange={(e) => updateField('rg', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="0000000"
                  />
                </div>
              </div>

              {/* CTPS + PIS */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">CTPS</label>
                  <input
                    type="text"
                    value={form.ctps}
                    onChange={(e) => updateField('ctps', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Numero / Serie"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">PIS</label>
                  <input
                    type="text"
                    value={form.pis}
                    onChange={(e) => updateField('pis', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="000.00000.00-0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Contrato ─────────────────────────────────────── */}
          {modalTab === 'contrato' && (
            <div className="space-y-4">
              {/* Cargo + Status */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Cargo</label>
                  <select
                    value={form.role}
                    onChange={(e) => updateField('role', e.target.value as Employee['role'])}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="auxiliar">Auxiliar</option>
                    <option value="lider">Lider</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="gerente">Gerente</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => updateField('status', e.target.value as Employee['status'])}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="ferias">Ferias</option>
                  </select>
                </div>
              </div>

              {/* Tipo Contrato */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Tipo de Contrato</label>
                <select
                  value={form.contractType}
                  onChange={(e) => updateField('contractType', e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecione...</option>
                  <option value="clt">CLT</option>
                  <option value="pj">PJ</option>
                  <option value="estagiario">Estagiario</option>
                  <option value="temporario">Temporario</option>
                </select>
              </div>

              {/* Data Admissao + Data Demissao */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Data de Admissao</label>
                  <input
                    type="date"
                    value={form.admissionDate}
                    onChange={(e) => updateField('admissionDate', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Data de Demissao</label>
                  <input
                    type="date"
                    value={form.terminationDate}
                    onChange={(e) => updateField('terminationDate', e.target.value)}
                    className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Valor/Hora + Custo Mensal */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Valor/Hora (R$)</label>
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
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">Custo Mensal (R$)</label>
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
            </div>
          )}

          {/* ── Tab: Endereco / Outros ─────────────────────────────── */}
          {modalTab === 'outros' && (
            <div className="space-y-4">
              {/* Endereco */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Endereco</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Rua, numero, bairro, cidade"
                />
              </div>

              {/* Dados Bancarios */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Dados Bancarios</label>
                <input
                  type="text"
                  value={form.bankAccount}
                  onChange={(e) => updateField('bankAccount', e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Banco / Agencia / Conta / PIX"
                />
              </div>

              {/* Contato de Emergencia */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Contato de Emergencia</label>
                <input
                  type="text"
                  value={form.emergencyContact}
                  onChange={(e) => updateField('emergencyContact', e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Nome - Telefone - Parentesco"
                />
              </div>

              {/* Observacoes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Observacoes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Informacoes adicionais..."
                />
              </div>
            </div>
          )}

          {/* ── Tab: Advertências ─────────────────────────────────── */}
          {modalTab === 'advertencias' && (
            <div className="space-y-3">
              {warnings.length === 0 ? (
                <div className="rounded-lg border border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhuma advertência registrada para este colaborador.
                </div>
              ) : (
                <div className="space-y-2">
                  {warnings.map(w => (
                    <div key={w.id} className="rounded-lg border border-border bg-card/50 px-4 py-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={cn(
                            'h-4 w-4 shrink-0',
                            w.type === 'termination' ? 'text-destructive' :
                            w.type === 'suspension' ? 'text-warning' : 'text-muted-foreground',
                          )} />
                          <span className="font-semibold text-foreground capitalize">
                            {w.type === 'verbal' ? 'Verbal' :
                             w.type === 'written' ? 'Escrita' :
                             w.type === 'suspension' ? 'Suspensão' : 'Desligamento'}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">{w.date}</span>
                      </div>
                      <p className="mt-1.5 text-muted-foreground">{w.description}</p>
                      {w.actionTaken && (
                        <p className="mt-1 text-xs text-muted-foreground">Ação: {w.actionTaken}</p>
                      )}
                      {w.witness && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Testemunha: {w.witness}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground/60">Registrado por: {w.createdBy}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Para registrar nova advertência, acesse a página <strong>Advertências</strong> no menu.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!form.name.trim()}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Login Modal ─────────────────────────────────────────────── */}
      <Modal isOpen={!!loginTarget} onClose={() => { setLoginTarget(null); setLoginPassword('') }} title="Criar Login">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">Criar Login</h3>
          </div>
          {loginTarget && (
            <>
              <p className="text-sm text-muted-foreground">
                Login: <span className="font-semibold text-foreground">{loginTarget.nickname || loginTarget.name}</span>
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px]">colaborador</span>
              </p>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Senha inicial</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void createLogin()}
                  placeholder="Minimo 4 caracteres"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setLoginTarget(null); setLoginPassword('') }}
                  className="flex-1 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void createLogin()}
                  disabled={loginPassword.length < 4 || loginSubmitting}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {loginSubmitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Criar Login'}
                </button>
              </div>
            </>
          )}
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
              onClick={() => void handleDelete()}
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
