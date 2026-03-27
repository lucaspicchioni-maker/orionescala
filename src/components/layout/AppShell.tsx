import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'

const pageTitles: Record<string, string> = {
  '/dph': 'Calculo DPH',
  '/escala': 'Escala',
  '/saldo': 'Saldo de Horas',
  '/colaboradores': 'Colaboradores',
  '/kpis': 'KPIs',
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
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md pl-16 lg:pl-6">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <span className="hidden text-sm capitalize text-muted-foreground sm:block">
            {dateStr}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
