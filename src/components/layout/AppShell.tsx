import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ErrorBoundary } from '@/components/ErrorBoundary'

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
  '/relatorios': 'Relatorios',
  '/historico-presenca': 'Historico de Presenca',
  '/troca-turno': 'Troca de Turno',
  '/banco-horas': 'Banco de Horas',
  '/feedback': 'Avaliacao',
  '/regras': 'Regras de Ouro',
  '/dimensionamento': 'Dimensionamento',
  '/rh': 'Painel RH',
  '/relatorio-layer': 'Relatorio',
  '/disponibilidade': 'Disponibilidade',
  '/dashboard-ao-vivo': 'Dashboard Ao Vivo',
  '/mural': 'Mural',
  '/custos': 'Custos Operacionais',
  '/avaliacao-turno': 'Avaliacao Turno',
  '/whatsapp': 'WhatsApp',
  '/recibo': 'Recibo de Pagamento',
  '/convocacoes': 'Convocacoes',
  '/clt-overrides': 'Auditoria CLT',
}

function formatDatePt(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function AppShell() {
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? 'Dashboard'
  const dateStr = formatDatePt()

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setInstallPrompt(null)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col lg:ml-0">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md pl-14 lg:h-16 lg:px-6 lg:pl-6">
          <h1 className="text-base font-semibold text-foreground lg:text-lg">{title}</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm capitalize text-muted-foreground sm:block">
              {dateStr}
            </span>
            {installPrompt && !installDismissed && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
                <span className="text-muted-foreground hidden sm:inline">Instalar app</span>
                <button
                  onClick={handleInstall}
                  className="font-semibold text-green-500 hover:text-green-400 transition-colors"
                >
                  Instalar
                </button>
                <button
                  onClick={() => setInstallDismissed(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors ml-1"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content — bottom padding for mobile nav */}
        <main className="flex-1 pb-20 lg:pb-0">
          <div className="mx-auto w-full max-w-7xl">
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
