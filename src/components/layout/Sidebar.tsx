import { useState, useMemo, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
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
  Shield,
  LogOut,
  Activity,
  DollarSign,
  Megaphone,
  Star,
  Clock,
  MessageCircle,
  ChevronDown,
  Briefcase,
  BarChart3,
  Settings2,
  Bell,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppContext'
import type { UserRole } from '@/types'


interface NavItem {
  label: string
  icon: ElementType
  to: string
}

interface NavGroup {
  label: string
  icon: ElementType
  items: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry
}

const navByRole: Record<UserRole, NavEntry[]> = {
  admin: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Ao Vivo', icon: Activity, to: '/dashboard-ao-vivo' },
    {
      label: 'Operacao', icon: Briefcase, items: [
        { label: 'Escala', icon: CalendarDays, to: '/escala' },
        { label: 'Equipe', icon: Users, to: '/colaboradores' },
        { label: 'Convocacoes', icon: Bell, to: '/convocacoes' },
      ],
    },
    {
      label: 'Gestao', icon: BarChart3, items: [
        { label: 'Custos', icon: DollarSign, to: '/custos' },
        { label: 'Regras', icon: Shield, to: '/regras' },
        { label: 'Relatorios', icon: ClipboardList, to: '/relatorio-layer' },
        { label: 'Recibo', icon: FileText, to: '/recibo' },
      ],
    },
    {
      label: 'Comunicacao', icon: Settings2, items: [
        { label: 'WhatsApp', icon: MessageCircle, to: '/whatsapp' },
        { label: 'Mural', icon: Megaphone, to: '/mural' },
      ],
    },
  ],
  gerente: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Ao Vivo', icon: Activity, to: '/dashboard-ao-vivo' },
    {
      label: 'Operacao', icon: Briefcase, items: [
        { label: 'Escala', icon: CalendarDays, to: '/escala' },
        { label: 'Equipe', icon: Users, to: '/colaboradores' },
        { label: 'Convocacoes', icon: Bell, to: '/convocacoes' },
        { label: 'Dimens.', icon: Calculator, to: '/dimensionamento' },
      ],
    },
    {
      label: 'Gestao', icon: BarChart3, items: [
        { label: 'Custos', icon: DollarSign, to: '/custos' },
        { label: 'Regras', icon: Shield, to: '/regras' },
        { label: 'Relatorios', icon: ClipboardList, to: '/relatorio-layer' },
        { label: 'Recibo', icon: FileText, to: '/recibo' },
      ],
    },
    {
      label: 'Comunicacao', icon: Settings2, items: [
        { label: 'WhatsApp', icon: MessageCircle, to: '/whatsapp' },
        { label: 'Mural', icon: Megaphone, to: '/mural' },
      ],
    },
  ],
  supervisor: [
    { label: 'Inicio', icon: Home, to: '/' },
    {
      label: 'Operacao', icon: Briefcase, items: [
        { label: 'Escala', icon: CalendarDays, to: '/escala' },
        { label: 'Convocacoes', icon: Bell, to: '/convocacoes' },
        { label: 'Check-in', icon: MapPin, to: '/checkin' },
        { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
        { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
      ],
    },
    { label: 'Mural', icon: Megaphone, to: '/mural' },
  ],
  rh: [
    { label: 'Inicio', icon: Home, to: '/' },
    {
      label: 'Gestao', icon: BarChart3, items: [
        { label: 'Painel RH', icon: UserCog, to: '/rh' },
        { label: 'Equipe', icon: Users, to: '/colaboradores' },
        { label: 'Dimens.', icon: Calculator, to: '/dimensionamento' },
        { label: 'Custos', icon: DollarSign, to: '/custos' },
        { label: 'Recibo', icon: FileText, to: '/recibo' },
      ],
    },
    { label: 'Mural', icon: Megaphone, to: '/mural' },
  ],
  colaborador: [
    { label: 'Inicio', icon: Home, to: '/' },
    {
      label: 'Meu Turno', icon: CalendarDays, items: [
        { label: 'Escala', icon: CalendarDays, to: '/minha-area' },
        { label: 'Check-in', icon: MapPin, to: '/checkin' },
        { label: 'Disponib.', icon: Clock, to: '/disponibilidade' },
      ],
    },
    { label: 'Avaliar', icon: Star, to: '/avaliacao-turno' },
    { label: 'Mural', icon: Megaphone, to: '/mural' },
  ],
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  rh: 'RH',
  colaborador: 'Colaborador',
}

function NavGroupItem({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const location = useLocation()
  const isAnyActive = group.items.some(item => location.pathname === item.to)
  const [open, setOpen] = useState(isAnyActive)
  useEffect(() => { setOpen(isAnyActive) }, [isAnyActive])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isAnyActive
            ? 'text-sidebar-primary'
            : 'text-sidebar-foreground hover:text-foreground hover:bg-white/5',
        )}
      >
        <group.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          {group.items.map(({ label, icon: Icon, to }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'text-sidebar-primary bg-sidebar-primary/8'
                    : 'text-sidebar-foreground/70 hover:text-foreground hover:bg-white/5',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const role = state.currentUser.role

  const entries = useMemo(() => navByRole[role] || navByRole.colaborador, [role])

  function logout() {
    dispatch({ type: 'SET_CURRENT_USER', payload: { name: '', role: 'colaborador' } })
    localStorage.removeItem('orion_logged_employee')
    navigate('/')
    setMobileOpen(false)
  }

  function closeMobile() {
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
          onClick={closeMobile}
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
          <NavLink to="/" onClick={closeMobile} className="flex items-center gap-2">
            <span className="text-gradient text-lg font-bold tracking-tight">Orion</span>
          </NavLink>
          <button
            type="button"
            onClick={closeMobile}
            className="rounded-md p-1 text-sidebar-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-5 pb-3">
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

        {/* Nav with groups */}
        <nav className="flex-1 overflow-y-auto px-3">
          <div className="space-y-0.5">
            {entries.map((entry) =>
              isGroup(entry) ? (
                <NavGroupItem key={entry.label} group={entry} onNavigate={closeMobile} />
              ) : (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.to === '/'}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-sidebar-primary bg-sidebar-primary/8'
                        : 'text-sidebar-foreground hover:text-foreground hover:bg-white/5',
                    )
                  }
                >
                  <entry.icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{entry.label}</span>
                </NavLink>
              ),
            )}
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
