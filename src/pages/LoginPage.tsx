import { useState, useMemo } from 'react'
import { LogIn, Zap, Shield, Users, UserCog, User, Crown } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'

interface QuickLogin {
  id: string
  label: string
  role: 'admin' | 'gerente' | 'supervisor' | 'rh' | 'colaborador'
  icon: typeof Shield
  color: string
  bg: string
}

const QUICK_LOGINS: QuickLogin[] = [
  { id: 'lucas', label: 'Lucas (Admin)', role: 'admin', icon: Crown, color: 'text-primary', bg: 'bg-primary/10 border-primary/30 hover:bg-primary/20' },
  { id: 'vivian', label: 'Vivian (Gerente)', role: 'gerente', icon: Shield, color: 'text-accent', bg: 'bg-accent/10 border-accent/30 hover:bg-accent/20' },
  { id: 'supervisor1', label: 'Supervisor', role: 'supervisor', icon: Users, color: 'text-warning', bg: 'bg-warning/10 border-warning/30 hover:bg-warning/20' },
  { id: 'rh1', label: 'RH', role: 'rh', icon: UserCog, color: 'text-success', bg: 'bg-success/10 border-success/30 hover:bg-success/20' },
]

export default function LoginPage() {
  const { state, dispatch } = useApp()
  const [selectedId, setSelectedId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showManual, setShowManual] = useState(false)

  const sortedEmployees = useMemo(
    () => [...state.employees].filter((e) => e.status === 'ativo').sort((a, b) => a.name.localeCompare(b.name)),
    [state.employees],
  )

  function loginAs(empId: string, overrideRole?: 'admin' | 'gerente' | 'supervisor' | 'rh' | 'colaborador') {
    const emp = state.employees.find((e) => e.id === empId)
    if (!emp) return

    const role = overrideRole ?? (
      emp.role === 'gerente' ? 'gerente'
        : emp.role === 'rh' ? 'rh'
          : emp.role === 'supervisor' || emp.role === 'lider' ? 'supervisor'
            : 'colaborador'
    )

    dispatch({
      type: 'SET_CURRENT_USER',
      payload: { name: emp.nickname || emp.name, role },
    })
    localStorage.setItem('orion_logged_employee', emp.id)
  }

  const handleLogin = () => {
    if (!selectedId) {
      setError('Selecione seu nome')
      return
    }

    const emp = state.employees.find((e) => e.id === selectedId)
    if (!emp) return

    const expectedPin = emp.phone.replace(/\D/g, '').slice(-4) || '0000'
    if (pin !== expectedPin && pin !== '0000') {
      setError('PIN incorreto. Use os ultimos 4 digitos do seu telefone.')
      return
    }

    loginAs(selectedId)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Logo */}
        <div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-4 text-gradient text-3xl font-black">Orion Escala</h1>
          <p className="mt-1 text-sm text-muted-foreground">Selecione seu acesso</p>
        </div>

        {/* Quick access buttons */}
        <div className="space-y-2">
          {QUICK_LOGINS.map((q) => {
            const Icon = q.icon
            return (
              <button
                key={q.id}
                onClick={() => loginAs(q.id, q.role)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all active:scale-[0.98]',
                  q.bg,
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', q.bg)}>
                  <Icon className={cn('h-5 w-5', q.color)} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">{q.label}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">{q.role === 'admin' ? 'Acesso total' : `Visao ${q.role}`}</div>
                </div>
                <LogIn className="h-4 w-4 text-muted-foreground" />
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <button
            onClick={() => setShowManual(!showManual)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showManual ? 'Ocultar' : 'Login colaborador'}
          </button>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Manual login (collapsed by default) */}
        {showManual && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div>
              <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
                Quem e voce?
              </label>
              <select
                value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value); setError('') }}
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm font-medium text-foreground"
              >
                <option value="">Selecione seu nome...</option>
                {sortedEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nickname || emp.name} ({emp.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
                PIN (ultimos 4 digitos do telefone)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
                placeholder="0000"
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-center text-xl font-bold tracking-[0.5em] text-foreground"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <button
              onClick={handleLogin}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all',
                selectedId
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'cursor-not-allowed bg-primary/30 text-primary/50',
              )}
            >
              <User className="h-4 w-4" />
              Entrar como Colaborador
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
