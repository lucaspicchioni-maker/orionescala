import { NavLink } from 'react-router-dom'
import type { ElementType } from 'react'
import {
  Home,
  CalendarDays,
  Fingerprint,
  Zap,
  MoreHorizontal,
  Clock,
  Users,
  Activity,
  Trophy,
  MapPin,
  Settings,
  FileDown,
  History,
  ArrowLeftRight,
  Wallet,
  Star,
  Shield,
  UserCog,
  Calculator,
  ClipboardList,
  BarChart3,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'
import { useApp } from '@/store/AppContext'

type Role = 'colaborador' | 'supervisor' | 'gerente' | 'rh' | 'admin'

interface NavItem {
  label: string
  icon: ElementType
  to: string
}

// Main bottom bar: max 4 items + "Mais"
const mainByRole: Record<Role, NavItem[]> = {
  colaborador: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/minha-area' },
    { label: 'Check-in', icon: MapPin, to: '/checkin' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
  ],
  supervisor: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
  ],
  gerente: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
  ],
  rh: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Painel RH', icon: UserCog, to: '/rh' },
    { label: 'Colab.', icon: Users, to: '/colaboradores' },
    { label: 'Dimension.', icon: Calculator, to: '/dimensionamento' },
  ],
  admin: [
    { label: 'Inicio', icon: Home, to: '/' },
    { label: 'Escala', icon: CalendarDays, to: '/escala' },
    { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
    { label: 'Produtiv.', icon: Zap, to: '/produtividade' },
  ],
}

// "Mais" drawer items — kept short and relevant
const moreByRole: Record<Role, NavItem[]> = {
  colaborador: [
    { label: 'Troca Turno', icon: ArrowLeftRight, to: '/troca-turno' },
    { label: 'Hist. Presenca', icon: History, to: '/historico-presenca' },
    { label: 'Avaliacao', icon: Star, to: '/feedback' },
    { label: 'Configuracoes', icon: Settings, to: '/configuracoes' },
  ],
  supervisor: [
    { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
    { label: 'KPIs', icon: Activity, to: '/kpis' },
    { label: 'Ranking', icon: Trophy, to: '/ranking' },
    { label: 'Banco Horas', icon: Wallet, to: '/banco-horas' },
    { label: 'Avaliacao', icon: Star, to: '/feedback' },
    { label: 'Troca Turno', icon: ArrowLeftRight, to: '/troca-turno' },
    { label: 'Rel. Layer', icon: ClipboardList, to: '/relatorio-layer' },
    { label: 'Configuracoes', icon: Settings, to: '/configuracoes' },
  ],
  gerente: [
    { label: 'KPIs', icon: Activity, to: '/kpis' },
    { label: 'Ranking', icon: Trophy, to: '/ranking' },
    { label: 'DPH', icon: BarChart3, to: '/dph' },
    { label: 'Regras', icon: Shield, to: '/regras' },
    { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
    { label: 'Banco Horas', icon: Wallet, to: '/banco-horas' },
    { label: 'Rel. Layer', icon: ClipboardList, to: '/relatorio-layer' },
    { label: 'Relatorios', icon: FileDown, to: '/relatorios' },
    { label: 'Configuracoes', icon: Settings, to: '/configuracoes' },
  ],
  rh: [
    { label: 'Banco Horas', icon: Wallet, to: '/banco-horas' },
    { label: 'Hist. Presenca', icon: History, to: '/historico-presenca' },
    { label: 'KPIs', icon: Activity, to: '/kpis' },
    { label: 'Avaliacao', icon: Star, to: '/feedback' },
    { label: 'Rel. Layer', icon: ClipboardList, to: '/relatorio-layer' },
    { label: 'Relatorios', icon: FileDown, to: '/relatorios' },
    { label: 'Configuracoes', icon: Settings, to: '/configuracoes' },
  ],
  admin: [
    { label: 'KPIs', icon: Activity, to: '/kpis' },
    { label: 'Ranking', icon: Trophy, to: '/ranking' },
    { label: 'DPH', icon: BarChart3, to: '/dph' },
    { label: 'Regras', icon: Shield, to: '/regras' },
    { label: 'Colaboradores', icon: Users, to: '/colaboradores' },
    { label: 'Painel RH', icon: UserCog, to: '/rh' },
    { label: 'Banco Horas', icon: Wallet, to: '/banco-horas' },
    { label: 'Rel. Layer', icon: ClipboardList, to: '/relatorio-layer' },
    { label: 'Relatorios', icon: FileDown, to: '/relatorios' },
    { label: 'Dimension.', icon: Calculator, to: '/dimensionamento' },
    { label: 'Check-in', icon: MapPin, to: '/checkin' },
    { label: 'Configuracoes', icon: Settings, to: '/configuracoes' },
  ],
}

export function BottomNav() {
  const [showMore, setShowMore] = useState(false)
  const { state } = useApp()
  const role = state.currentUser.role

  const mainItems = useMemo(() => mainByRole[role] || mainByRole.colaborador, [role])
  const moreItems = useMemo(() => moreByRole[role] || moreByRole.colaborador, [role])

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* More menu drawer */}
      {showMore && (
        <div className="fixed bottom-16 left-0 right-0 z-50 mx-3 mb-1 rounded-xl border border-border bg-card p-2 shadow-xl lg:hidden">
          <div className="grid grid-cols-2 gap-1">
            {moreItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setShowMore(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md safe-bottom lg:hidden">
        <div className="flex items-stretch">
          {mainItems.map(({ label, icon: Icon, to }) => (
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
          {moreItems.length > 0 && (
            <button
              onClick={() => setShowMore((v) => !v)}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                showMore ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Mais</span>
            </button>
          )}
        </div>
      </nav>
    </>
  )
}
