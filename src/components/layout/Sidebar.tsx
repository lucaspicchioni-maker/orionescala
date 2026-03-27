import { useState, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { ElementType } from 'react'
import {
  CalendarDays,
  Users,
  X,
  Menu,
  Fingerprint,
  Zap,
  Home,
  ClipboardList,
  MapPin,
  UserCog,
  Calculator,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppContext'

type Role = 'colaborador' | 'supervisor' | 'gerente' | 'rh' | 'admin'

interface NavItem {
  label: string
  icon: ElementType
  to: string
}

// Max 4 items per role. Ultra clean.
const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Equipe', icon: Users, to: '/colaboradores' },
    { label: 'Relatorios', icon: ClipboardList, to: '/relatorio-layer' },
  ],
  gerente: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Equipe', icon: Users, to: '/colaboradores' },
    { label: 'Dimens.', icon: Calculator, to: '/dimensionamento' },
    { label: 'Relatorios', icon: ClipboardList, to: '/relatorio-layer' },
  ],
  supervisor: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Check-in', icon: MapPin, to: '/checkin' },
    { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
    { label: 'Produtividade', icon: Zap, to: '/produtividade' },
  ],
  rh: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Painel RH', icon: UserCog, to: '/rh' },
    { label: 'Equipe', icon: Users, to: '/colaboradores' },
    { label: 'Dimens.', icon: Calculator, to: '/dimensionamento' },
  ],
  colaborador: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Minha Escala', icon: CalendarDays, to: '/minha-area' },
    { label: 'Check-in', icon: MapPin, to: '/checkin' },
  ],
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  rh: 'RH',
  colaborador: 'Colaborador',
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const role = state.currentUser.role

  const items = useMemo(() => navByRole[role] || navByRole.colaborador, [role])

  function logout() {
    dispatch({ type: 'SET_CURRENT_USER', payload: { name: '', role: 'colaborador' } })
    localStorage.removeItem('orion_logged_employee')
    navigate('/')
    setMobileOpen(false)
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 rounded-lg bg-sidebar p-2 text-sidebar-foreground lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'glass-strong fixed inset-y-0 left-0 z-50 flex w-52 flex-col border-r border-sidebar-border bg-sidebar',
          'transition-transform duration-300 ease-in-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-5">
          <NavLink to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
            <span className="text-gradient text-lg font-bold tracking-tight">Orion</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-sidebar-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-sidebar-foreground/60">{state.currentUser.name}</span>
            <span className={cn(
              'rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
              role === 'admin' ? 'bg-primary/15 text-primary' :
                role === 'gerente' ? 'bg-accent/15 text-accent' :
                  role === 'supervisor' ? 'bg-warning/15 text-warning' :
                    role === 'rh' ? 'bg-success/15 text-success' :
                      'bg-muted text-muted-foreground',
            )}>
              {ROLE_LABELS[role]}
            </span>
          </div>
        </div>

        {/* Nav - clean, short list */}
        <nav className="flex-1 px-3">
          <div className="space-y-1">
            {items.map(({ label, icon: Icon, to }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-sidebar-primary bg-sidebar-primary/8'
                      : 'text-sidebar-foreground hover:text-foreground hover:bg-white/5',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-sidebar-border px-3 py-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}
