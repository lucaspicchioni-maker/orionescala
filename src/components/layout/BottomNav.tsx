import { NavLink } from 'react-router-dom'
import type { ElementType } from 'react'
import {
  Home,
  CalendarDays,
  Fingerprint,
  Zap,
  MapPin,
  Users,
  UserCog,
  ClipboardList,
  Calculator,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import { useApp } from '@/store/AppContext'

type Role = 'colaborador' | 'supervisor' | 'gerente' | 'rh' | 'admin'

interface NavItem {
  label: string
  icon: ElementType
  to: string
}

// Mobile: max 5 items. That's it.
const bottomByRole: Record<Role, NavItem[]> = {
  admin: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
    { label: 'Config', icon: Settings, to: '/configuracoes' },
  ],
  gerente: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
    { label: 'Relatorio', icon: ClipboardList, to: '/relatorio-layer' },
  ],
  supervisor: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
    { label: 'Equipe', icon: Users, to: '/colaboradores' },
  ],
  rh: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Painel', icon: UserCog, to: '/rh' },
    { label: 'Equipe', icon: Users, to: '/colaboradores' },
    { label: 'Dimens.', icon: Calculator, to: '/dimensionamento' },
    { label: 'Relatorio', icon: ClipboardList, to: '/relatorio-layer' },
  ],
  colaborador: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/minha-area' },
    { label: 'Check-in', icon: MapPin, to: '/checkin' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
    { label: 'Config', icon: Settings, to: '/configuracoes' },
  ],
}

export function BottomNav() {
  const { state } = useApp()
  const role = state.currentUser.role

  const items = useMemo(() => bottomByRole[role] || bottomByRole.colaborador, [role])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md safe-bottom lg:hidden">
      <div className="flex items-stretch">
        {items.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
