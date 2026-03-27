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
  MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppContext'

type Role = 'colaborador' | 'supervisor' | 'gerente' | 'rh' | 'admin'

interface NavItem {
  label: string
  icon: ElementType
  to: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

function getNavGroups(role: Role): NavGroup[] {
  if (role === 'admin') {
    return [
      {
        title: '',
        items: [
          { label: 'Inicio', icon: Home, to: '/' },
        ],
      },
      {
        title: 'Operacao',
        items: [
          { label: 'Escala', icon: CalendarDays, to: '/escala' },
          { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
          { label: 'Check-in', icon: MapPin, to: '/checkin' },
          { label: 'Produtividade', icon: Zap, to: '/produtividade' },
          { label: 'Troca de Turno', icon: ArrowLeftRight, to: '/troca-turno' },
        ],
      },
      {
        title: 'Analise',
        items: [
          { label: 'KPIs', icon: Activity, to: '/kpis' },
          { label: 'Ranking', icon: Trophy, to: '/ranking' },
          { label: 'Calculo DPH', icon: BarChart3, to: '/dph' },
          { label: 'Regras de Ouro', icon: Shield, to: '/regras' },
          { label: 'Relatorio Layer', icon: ClipboardList, to: '/relatorio-layer' },
        ],
      },
      {
        title: 'Pessoas',
        items: [
          { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
          { label: 'Painel RH', icon: UserCog, to: '/rh' },
          { label: 'Avaliacao', icon: Star, to: '/feedback' },
          { label: 'Dimensionamento', icon: Calculator, to: '/dimensionamento' },
        ],
      },
      {
        title: 'Horas & Historico',
        items: [
          { label: 'Saldo de Horas', icon: Clock, to: '/saldo' },
          { label: 'Banco de Horas', icon: Wallet, to: '/banco-horas' },
          { label: 'Hist. Presenca', icon: History, to: '/historico-presenca' },
          { label: 'Relatorios CSV', icon: FileDown, to: '/relatorios' },
        ],
      },
    ]
  }

  if (role === 'gerente') {
    return [
      {
        title: '',
        items: [
          { label: 'Inicio', icon: Home, to: '/' },
        ],
      },
      {
        title: 'Operacao',
        items: [
          { label: 'Escala', icon: CalendarDays, to: '/escala' },
          { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
          { label: 'Produtividade', icon: Zap, to: '/produtividade' },
        ],
      },
      {
        title: 'Analise',
        items: [
          { label: 'KPIs', icon: Activity, to: '/kpis' },
          { label: 'Ranking', icon: Trophy, to: '/ranking' },
          { label: 'Calculo DPH', icon: BarChart3, to: '/dph' },
          { label: 'Regras de Ouro', icon: Shield, to: '/regras' },
          { label: 'Relatorio Layer', icon: ClipboardList, to: '/relatorio-layer' },
        ],
      },
      {
        title: 'Pessoas & Horas',
        items: [
          { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
          { label: 'Banco de Horas', icon: Wallet, to: '/banco-horas' },
          { label: 'Relatorios CSV', icon: FileDown, to: '/relatorios' },
        ],
      },
    ]
  }

  if (role === 'supervisor') {
    return [
      {
        title: '',
        items: [
          { label: 'Inicio', icon: Home, to: '/' },
        ],
      },
      {
        title: 'Operacao',
        items: [
          { label: 'Escala', icon: CalendarDays, to: '/escala' },
          { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
          { label: 'Produtividade', icon: Zap, to: '/produtividade' },
          { label: 'Troca de Turno', icon: ArrowLeftRight, to: '/troca-turno' },
        ],
      },
      {
        title: 'Analise',
        items: [
          { label: 'KPIs', icon: Activity, to: '/kpis' },
          { label: 'Ranking', icon: Trophy, to: '/ranking' },
          { label: 'Relatorio Layer', icon: ClipboardList, to: '/relatorio-layer' },
        ],
      },
      {
        title: 'Equipe',
        items: [
          { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
          { label: 'Banco de Horas', icon: Wallet, to: '/banco-horas' },
          { label: 'Avaliacao', icon: Star, to: '/feedback' },
          { label: 'Relatorios CSV', icon: FileDown, to: '/relatorios' },
        ],
      },
    ]
  }

  if (role === 'rh') {
    return [
      {
        title: '',
        items: [
          { label: 'Inicio', icon: Home, to: '/' },
          { label: 'Painel RH', icon: UserCog, to: '/rh' },
        ],
      },
      {
        title: 'Pessoas',
        items: [
          { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
          { label: 'Dimensionamento', icon: Calculator, to: '/dimensionamento' },
          { label: 'Avaliacao', icon: Star, to: '/feedback' },
        ],
      },
      {
        title: 'Acompanhamento',
        items: [
          { label: 'Hist. Presenca', icon: History, to: '/historico-presenca' },
          { label: 'Banco de Horas', icon: Wallet, to: '/banco-horas' },
          { label: 'KPIs', icon: Activity, to: '/kpis' },
          { label: 'Relatorio Layer', icon: ClipboardList, to: '/relatorio-layer' },
          { label: 'Relatorios CSV', icon: FileDown, to: '/relatorios' },
        ],
      },
    ]
  }

  // colaborador
  return [
    {
      title: '',
      items: [
        { label: 'Inicio', icon: Home, to: '/' },
        { label: 'Minha Escala', icon: CalendarDays, to: '/minha-area' },
        { label: 'Check-in', icon: MapPin, to: '/checkin' },
        { label: 'Produtividade', icon: Zap, to: '/produtividade' },
        { label: 'Troca de Turno', icon: ArrowLeftRight, to: '/troca-turno' },
        { label: 'Hist. Presenca', icon: History, to: '/historico-presenca' },
      ],
    },
  ]
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { state } = useApp()
  const role = state.currentUser.role

  const groups = useMemo(() => getNavGroups(role), [role])

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
          'glass-strong fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-sidebar-border bg-sidebar',
          'transition-transform duration-300 ease-in-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between px-5">
          <NavLink to="/" onClick={() => setMobileOpen(false)}>
            <span className="text-gradient text-lg font-bold tracking-tight">Orion</span>
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

        {/* Role badge */}
        <div className="px-5 pb-2">
          <span className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            role === 'admin' ? 'bg-primary/15 text-primary' :
              role === 'gerente' ? 'bg-accent/15 text-accent' :
                role === 'supervisor' ? 'bg-warning/15 text-warning' :
                  role === 'rh' ? 'bg-success/15 text-success' :
                    'bg-muted text-muted-foreground',
          )}>
            {role === 'admin' ? 'Admin' : role}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
              {group.title && (
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ label, icon: Icon, to }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                        isActive
                          ? 'text-sidebar-primary bg-sidebar-primary/8'
                          : 'text-sidebar-foreground hover:text-foreground hover:bg-white/5',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border px-3 py-3">
          <NavLink
            to="/configuracoes"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'text-sidebar-primary'
                  : 'text-sidebar-foreground hover:text-foreground hover:bg-white/5',
              )
            }
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>Configuracoes</span>
          </NavLink>
        </div>
      </aside>
    </>
  )
}
