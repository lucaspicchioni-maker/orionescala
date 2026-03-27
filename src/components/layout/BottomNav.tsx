import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  Fingerprint,
  User,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const mainItems = [
  { label: 'DPH', icon: BarChart3, to: '/dph' },
  { label: 'Escala', icon: CalendarDays, to: '/escala' },
  { label: 'Ponto', icon: Fingerprint, to: '/ponto' },
  { label: 'Minha Area', icon: User, to: '/minha-area' },
]

const moreItems = [
  { label: 'Produtividade', to: '/produtividade' },
  { label: 'Saldo de Horas', to: '/saldo' },
  { label: 'Colaboradores', to: '/colaboradores' },
  { label: 'KPIs', to: '/kpis' },
  { label: 'Ranking', to: '/ranking' },
  { label: 'Check-in', to: '/checkin' },
  { label: 'Configuracoes', to: '/configuracoes' },
]

export function BottomNav() {
  const [showMore, setShowMore] = useState(false)

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
                    'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
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
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
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
        </div>
      </nav>
    </>
  )
}
