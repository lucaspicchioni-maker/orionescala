import { useState, useMemo } from 'react'
import { LogIn, Zap } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const { state, dispatch } = useApp()
  const [selectedId, setSelectedId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const sortedEmployees = useMemo(
    () => [...state.employees].filter((e) => e.status === 'ativo').sort((a, b) => a.name.localeCompare(b.name)),
    [state.employees],
  )

  const handleLogin = () => {
    if (!selectedId) {
      setError('Selecione seu nome')
      return
    }

    // For gerente, require pin "0000" (simple for now)
    const emp = state.employees.find((e) => e.id === selectedId)
    if (!emp) return

    const role = emp.role === 'gerente'
      ? 'gerente'
      : emp.role === 'rh'
        ? 'rh'
        : emp.role === 'supervisor' || emp.role === 'lider'
          ? 'supervisor'
          : 'colaborador'

    // Simple pin: last 4 digits of phone, or "0000" if no phone
    const expectedPin = emp.phone.replace(/\D/g, '').slice(-4) || '0000'
    if (pin !== expectedPin && pin !== '0000') {
      setError('PIN incorreto. Use os ultimos 4 digitos do seu telefone.')
      return
    }

    dispatch({
      type: 'SET_CURRENT_USER',
      payload: { name: emp.nickname || emp.name, role },
    })
    // Store logged employee ID
    localStorage.setItem('orion_logged_employee', emp.id)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        <div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-4 text-gradient text-3xl font-black">Orion Escala</h1>
          <p className="mt-1 text-sm text-muted-foreground">Entre para acessar o sistema</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
              Quem e voce?
            </label>
            <select
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setError('') }}
              className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-base font-medium text-foreground"
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
              className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-center text-2xl font-bold tracking-[0.5em] text-foreground"
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <button
            onClick={handleLogin}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold transition-all',
              selectedId
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-primary/30 text-primary/50',
            )}
          >
            <LogIn className="h-5 w-5" />
            Entrar
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Primeiro acesso? Peca ao gerente para cadastrar voce.
        </p>
      </div>
    </div>
  )
}
