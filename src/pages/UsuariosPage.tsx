import { useState, useEffect } from 'react'
import { Users, Plus, Trash2, KeyRound, Loader2, Shield } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { useApp } from '@/store/AppContext'

interface SystemUser {
  id: string
  name: string
  role: string
  employee_id: string | null
}

const ROLE_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'muted' }> = {
  admin: { label: 'Admin', variant: 'default' },
  gerente: { label: 'Gerente', variant: 'success' },
  supervisor: { label: 'Supervisor', variant: 'warning' },
  rh: { label: 'RH', variant: 'muted' },
  colaborador: { label: 'Colaborador', variant: 'muted' },
}

const ROLES = ['admin', 'gerente', 'supervisor', 'rh', 'colaborador'] as const

export default function UsuariosPage() {
  const { state } = useApp()
  const { toast } = useToast()
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [changingPassword, setChangingPassword] = useState<SystemUser | null>(null)

  // New user form
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<typeof ROLES[number]>('colaborador')
  const [newPassword, setNewPassword] = useState('')
  const [newEmployeeId, setNewEmployeeId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Password change form
  const [newPwd, setNewPwd] = useState('')

  async function loadUsers() {
    setLoading(true)
    try {
      const data = await api.get<SystemUser[]>('/api/users')
      setUsers(data)
    } catch {
      toast('error', 'Erro ao carregar usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  async function createUser() {
    if (!newName.trim() || !newPassword) return
    setSubmitting(true)
    try {
      await api.post('/api/users', {
        name: newName.trim(),
        role: newRole,
        password: newPassword,
        employeeId: newEmployeeId || undefined,
      })
      toast('success', `Usuario "${newName}" criado com sucesso`)
      setNewName(''); setNewPassword(''); setNewRole('colaborador'); setNewEmployeeId(''); setShowCreate(false)
      loadUsers()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao criar usuario')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteUser(user: SystemUser) {
    if (!confirm(`Remover o usuario "${user.name}"?`)) return
    try {
      await api.del(`/api/users/${user.id}`)
      toast('success', 'Usuario removido')
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao remover')
    }
  }

  async function changePassword() {
    if (!changingPassword || !newPwd || newPwd.length < 4) return
    setSubmitting(true)
    try {
      await api.put(`/api/users/${changingPassword.id}/password`, { password: newPwd })
      toast('success', 'Senha alterada com sucesso')
      setChangingPassword(null); setNewPwd('')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Erro ao alterar senha')
    } finally {
      setSubmitting(false)
    }
  }

  const activeEmployees = state.employees.filter(e => e.status === 'ativo')

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
            <Shield className="h-6 w-6 text-primary" />
            Gestao de Usuarios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Logins e senhas para acesso ao sistema</p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo Usuario
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card variant="glass" className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Novo Usuario</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Nome de login</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: Joao Silva"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Senha inicial</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimo 4 caracteres"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Funcao (role)</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as typeof ROLES[number])}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_CONFIG[r]?.label ?? r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Vincular a colaborador (opcional)</label>
              <select
                value={newEmployeeId}
                onChange={e => setNewEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— Sem vinculo —</option>
                {activeEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80"
            >
              Cancelar
            </button>
            <button
              onClick={createUser}
              disabled={!newName.trim() || !newPassword || submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Criar Usuario'}
            </button>
          </div>
        </Card>
      )}

      {/* Password change modal */}
      {changingPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setChangingPassword(null); setNewPwd('') }}>
          <div className="glass-strong mx-4 w-full max-w-sm rounded-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">Alterar Senha</h3>
            </div>
            <p className="text-sm text-muted-foreground">Usuario: <span className="font-medium text-foreground">{changingPassword.name}</span></p>
            <input
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void changePassword()}
              placeholder="Nova senha (min. 4 caracteres)"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => { setChangingPassword(null); setNewPwd('') }} className="flex-1 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80">Cancelar</button>
              <button onClick={() => void changePassword()} disabled={newPwd.length < 4 || submitting} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card variant="glass">
          <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            {users.length} usuario{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {users.map(user => {
              const cfg = ROLE_CONFIG[user.role] ?? { label: user.role, variant: 'muted' as const }
              const linkedEmp = user.employee_id ? state.employees.find(e => e.id === user.employee_id) : null
              return (
                <div key={user.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                      {linkedEmp && <p className="text-[11px] text-muted-foreground truncate">Vinculado a: {linkedEmp.name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                    <button
                      onClick={() => { setChangingPassword(user); setNewPwd('') }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Alterar senha"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void deleteUser(user)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Remover usuario"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Credentials reference */}
      <Card variant="glass">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acessos por Funcao</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { role: 'admin', desc: 'Acesso total ao sistema' },
            { role: 'gerente', desc: 'Escala, custos, relatorios, WhatsApp' },
            { role: 'supervisor', desc: 'Escala, convocacoes, check-in, ponto' },
            { role: 'rh', desc: 'Painel RH, equipe, custos, dimensionamento' },
            { role: 'colaborador', desc: 'Minha area, check-in, disponibilidade' },
          ].map(({ role, desc }) => {
            const cfg = ROLE_CONFIG[role]
            return (
              <div key={role} className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
                <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
