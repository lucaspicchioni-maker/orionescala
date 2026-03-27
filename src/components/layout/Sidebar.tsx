import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  Clock,
  Users,
  Activity,
  Trophy,
  Settings,
  X,
  Menu,
  Fingerprint,
  User,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Calculo DPH', icon: BarChart3, to: '/dph' },
  { label: 'Escala', icon: CalendarDays, to: '/escala' },
  { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
  { label: 'Saldo de Horas', icon: Clock, to: '/saldo' },
  { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
  { label: 'Produtividade', icon: Zap, to: '/produtividade' },
  { label: 'KPIs', icon: Activity, to: '/kpis' },
  { label: 'Ranking', icon: Trophy, to: '/ranking' },
  { label: 'Minha Area', icon: User, to: '/minha-area' },
] as const

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 rounded-lg bg-sidebar p-2 text-sidebar-foreground lg:hidden"
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
          'glass-strong fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar',
          'transition-transform duration-300 ease-in-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6">
          <span className="text-gradient text-xl font-bold tracking-tight">
            Orion
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-sidebar-foreground hover:text-foreground lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ label, icon: Icon, to }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-l-2 border-sidebar-primary text-sidebar-primary bg-sidebar-primary/8'
                    : 'border-l-2 border-transparent text-sidebar-foreground hover:text-foreground hover:bg-white/5',
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border px-3 py-4">
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'text-sidebar-primary'
                  : 'text-sidebar-foreground hover:text-foreground hover:bg-white/5',
              )
            }
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            <span>Configuracoes</span>
          </NavLink>
        </div>
      </aside>
    </>
  )
}
