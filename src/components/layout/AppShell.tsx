import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'

const pageTitles: Record<string, string> = {
  '/': 'Inicio',
  '/dph': 'Calculo DPH',
  '/escala': 'Escala',
  '/saldo': 'Saldo de Horas',
  '/colaboradores': 'Colaboradores',
  '/kpis': 'KPIs',
  '/ponto': 'Ponto',
  '/checkin': 'Check-in',
  '/minha-area': 'Minha Area',
  '/ranking': 'Ranking',
  '/produtividade': 'Produtividade',
  '/configuracoes': 'Configuracoes',
}

function formatDatePt(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function AppShell() {
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? 'Dashboard'
  const dateStr = formatDatePt()

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col lg:ml-0">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md pl-14 lg:h-16 lg:px-6 lg:pl-6">
          <h1 className="text-base font-semibold text-foreground lg:text-lg">{title}</h1>
          <span className="hidden text-sm capitalize text-muted-foreground sm:block">
            {dateStr}
          </span>
        </header>

        {/* Page content — bottom padding for mobile nav */}
        <main className="flex-1 pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
