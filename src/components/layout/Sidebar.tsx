import { useState, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import type { ElementType } from 'react'
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
  Home,
  FileDown,
  History,
  ArrowLeftRight,
  Wallet,
  Star,
  Shield,
  UserCog,
  Calculator,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppContext'

interface NavItem {
  label: string
  icon: ElementType
  to: string
  roles: ('colaborador' | 'supervisor' | 'gerente' | 'rh')[]
}

const navItems: NavItem[] = [
  { label: 'Inicio', icon: Home, to: '/', roles: ['colaborador', 'supervisor', 'gerente', 'rh'] },
  { label: 'Calculo DPH', icon: BarChart3, to: '/dph', roles: ['gerente'] },
  { label: 'Escala', icon: CalendarDays, to: '/escala', roles: ['supervisor', 'gerente'] },
  { label: 'Ponto', icon: Fingerprint, to: '/ponto', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'Produtividade', icon: Zap, to: '/produtividade', roles: ['colaborador', 'supervisor', 'gerente'] },
  { label: 'Saldo de Horas', icon: Clock, to: '/saldo', roles: ['supervisor', 'gerente'] },
  { label: 'Colaboradores', icon: Users, to: '/colaboradores', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'KPIs', icon: Activity, to: '/kpis', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'Ranking', icon: Trophy, to: '/ranking', roles: ['supervisor', 'gerente'] },
  { label: 'Banco de Horas', icon: Wallet, to: '/banco-horas', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'Historico Presenca', icon: History, to: '/historico-presenca', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'Troca de Turno', icon: ArrowLeftRight, to: '/troca-turno', roles: ['colaborador', 'supervisor', 'gerente'] },
  { label: 'Avaliacao', icon: Star, to: '/feedback', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'Regras de Ouro', icon: Shield, to: '/regras', roles: ['supervisor', 'gerente'] },
  { label: 'Dimensionamento', icon: Calculator, to: '/dimensionamento', roles: ['gerente', 'rh'] },
  { label: 'Painel RH', icon: UserCog, to: '/rh', roles: ['rh', 'gerente'] },
  { label: 'Relatorios CSV', icon: FileDown, to: '/relatorios', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'Relatorio Layer', icon: ClipboardList, to: '/relatorio-layer', roles: ['supervisor', 'gerente', 'rh'] },
  { label: 'Minha Area', icon: User, to: '/minha-area', roles: ['colaborador'] },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { state } = useApp()
  const role = state.currentUser.role

  const filtered = useMemo(
    () => navItems.filter((item) => item.roles.includes(role)),
    [role],
  )

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
          'glass-strong fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar',
          'transition-transform duration-300 ease-in-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6">
          <NavLink to="/" onClick={() => setMobileOpen(false)}>
            <span className="text-gradient text-xl font-bold tracking-tight">Orion</span>
          </NavLink>
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
          {filtered.map(({ label, icon: Icon, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
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
            onClick={() => setMobileOpen(false)}
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
