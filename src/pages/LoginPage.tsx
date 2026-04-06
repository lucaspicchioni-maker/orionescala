import { useState } from 'react'
import { LogIn, Zap, User, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import { api, setToken } from '@/lib/api'

interface LoginResponse {
  token: string
  user: {
    id: string
    name: string
    role: 'admin' | 'gerente' | 'supervisor' | 'rh' | 'colaborador'
    employeeId: string | null
  }
}

export default function LoginPage() {
  const { dispatch } = useApp()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!name.trim() || !password) return
    setLoading(true)
    setError('')

    try {
      const data = await api.post<LoginResponse>('/api/auth/login', {
        name: name.trim(),
        password,
      })

      setToken(data.token)

      dispatch({
        type: 'SET_CURRENT_USER',
        payload: { name: data.user.name, role: data.user.role, employeeId: data.user.employeeId ?? undefined },
      })

      if (data.user.employeeId) {
        localStorage.setItem('orion_logged_employee', data.user.employeeId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciais invalidas')
    } finally {
      setLoading(false)
    }
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
          <p className="mt-1 text-sm text-muted-foreground">Entre com seu nome e senha</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-left text-xs font-medium text-muted-foreground">
              Nome
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="Seu nome"
                autoComplete="username"
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
                placeholder="Sua senha"
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
            disabled={loading || !name.trim() || !password}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold transition-all',
              name.trim() && password && !loading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-primary/30 text-primary/50',
            )}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <LogIn className="h-5 w-5" />
            )}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <div className="space-y-1 text-center">
          <p className="text-xs text-muted-foreground">
            Peca suas credenciais ao gestor da operacao.
          </p>
          <p className="text-xs text-muted-foreground">
            Esqueceu sua senha? Solicite ao administrador que a redefina em{' '}
            <span className="text-primary">Configuracoes → Usuarios</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
