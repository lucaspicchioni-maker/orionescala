import { useState } from 'react'
import { LogIn, Zap, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'

interface LoginAccount {
  email: string
  password: string
  name: string
  role: 'admin' | 'gerente' | 'supervisor' | 'rh' | 'colaborador'
  employeeId: string
}

const ACCOUNTS: LoginAccount[] = [
  { email: 'lucas@orion.com', password: 'lucas123', name: 'Lucas', role: 'admin', employeeId: 'lucas' },
  { email: 'vivian@orion.com', password: 'vivian123', name: 'Vívian', role: 'gerente', employeeId: 'vivian' },
  { email: 'supervisor@orion.com', password: 'super123', name: 'Supervisor', role: 'supervisor', employeeId: 'supervisor1' },
  { email: 'rh@orion.com', password: 'rh1234', name: 'RH', role: 'rh', employeeId: 'rh1' },
  { email: 'miguel@orion.com', password: 'miguel123', name: 'Miguel', role: 'colaborador', employeeId: 'miguel' },
  { email: 'anna@orion.com', password: 'anna1234', name: 'Anna', role: 'colaborador', employeeId: 'anna' },
]

export default function LoginPage() {
  const { dispatch } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  function handleLogin() {
    const account = ACCOUNTS.find(
      a => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password,
    )
    if (!account) {
      setError('Email ou senha incorretos')
      return
    }

    dispatch({
      type: 'SET_CURRENT_USER',
      payload: { name: account.name, role: account.role },
    })
    localStorage.setItem('orion_logged_employee', account.employeeId)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin()
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
          <p className="mt-1 text-sm text-muted-foreground">Entre com seu email e senha</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="seu@email.com"
                autoComplete="email"
                className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-3.5 text-sm font-medium text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-border bg-card pl-10 pr-12 py-3.5 text-sm font-medium text-foreground placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <button
            onClick={handleLogin}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold transition-all',
              email && password
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-primary/30 text-primary/50',
            )}
          >
            <LogIn className="h-5 w-5" />
            Entrar
          </button>
        </div>

        {/* Help text */}
        <p className="text-xs text-muted-foreground">
          Peca suas credenciais ao gestor da operacao.
        </p>
      </div>
    </div>
  )
}
