import { lazy, Suspense, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { UserRole } from '@/types'
import { AppShell } from '@/components/layout/AppShell'
import { AppProvider, useApp } from '@/store/AppContext'
import { Onboarding } from '@/components/Onboarding'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import LoginPage from '@/pages/LoginPage'
import ConfirmarPage from '@/pages/ConfirmarPage'

const DPHPage = lazy(() => import('@/pages/DPHPage'))
const EscalaPage = lazy(() => import('@/pages/EscalaPage'))
const SaldoPage = lazy(() => import('@/pages/SaldoPage'))
const ColaboradoresPage = lazy(() => import('@/pages/ColaboradoresPage'))
const KPIsPage = lazy(() => import('@/pages/KPIsPage'))
const RankingPage = lazy(() => import('@/pages/RankingPage'))
const PontoPage = lazy(() => import('@/pages/PontoPage'))
const CheckInPage = lazy(() => import('@/pages/CheckInPage'))
const MinhaAreaPage = lazy(() => import('@/pages/MinhaAreaPage'))
const ProdutividadePage = lazy(() => import('@/pages/ProdutividadePage'))
const ConfiguracoesPage = lazy(() => import('@/pages/ConfiguracoesPage'))
const HomePage = lazy(() => import('@/pages/HomePage'))
const RelatoriosPage = lazy(() => import('@/pages/RelatoriosPage'))
const HistoricoPresencaPage = lazy(() => import('@/pages/HistoricoPresencaPage'))
const TrocaTurnoPage = lazy(() => import('@/pages/TrocaTurnoPage'))
const BancoHorasPage = lazy(() => import('@/pages/BancoHorasPage'))
const FeedbackPage = lazy(() => import('@/pages/FeedbackPage'))
const RegrasDeOuroPage = lazy(() => import('@/pages/RegrasDeOuroPage'))
const DimensionamentoPage = lazy(() => import('@/pages/DimensionamentoPage'))
const RHDashboardPage = lazy(() => import('@/pages/RHDashboardPage'))
const RelatorioLayerPage = lazy(() => import('@/pages/RelatorioLayerPage'))
const DisponibilidadePage = lazy(() => import('@/pages/DisponibilidadePage'))
const DashboardAoVivoPage = lazy(() => import('@/pages/DashboardAoVivoPage'))
const MuralPage = lazy(() => import('@/pages/MuralPage'))
const CustosOperacionaisPage = lazy(() => import('@/pages/CustosOperacionaisPage'))
const AvaliacaoTurnoPage = lazy(() => import('@/pages/AvaliacaoTurnoPage'))
const WhatsAppPage = lazy(() => import('@/pages/WhatsAppPage'))
const ReciboPagamentoPage = lazy(() => import('@/pages/ReciboPagamentoPage'))
const ConvocacoesPage = lazy(() => import('@/pages/ConvocacoesPage'))
const UsuariosPage = lazy(() => import('@/pages/UsuariosPage'))
const VacoesPage = lazy(() => import('@/pages/VacoesPage'))
const EPIsPage = lazy(() => import('@/pages/EPIsPage'))
const ClimaPesquisaPage = lazy(() => import('@/pages/ClimaPesquisaPage'))

const ROUTE_ACCESS: Record<string, UserRole[]> = {
  '/': ['admin', 'gerente', 'supervisor', 'rh', 'colaborador'],
  '/mural': ['admin', 'gerente', 'supervisor', 'rh', 'colaborador'],
  '/configuracoes': ['admin', 'gerente', 'supervisor', 'rh', 'colaborador'],
  '/minha-area': ['admin', 'gerente', 'supervisor', 'colaborador'],
  '/checkin': ['admin', 'supervisor', 'colaborador'],
  '/disponibilidade': ['admin', 'colaborador'],
  '/avaliacao-turno': ['admin', 'colaborador'],
  '/escala': ['admin', 'gerente', 'supervisor'],
  '/ponto': ['admin', 'gerente', 'supervisor'],
  '/produtividade': ['admin', 'gerente', 'supervisor'],
  '/feedback': ['admin', 'gerente', 'supervisor'],
  '/convocacoes': ['admin', 'gerente', 'supervisor'],
  '/usuarios': ['admin'],
  '/dashboard-ao-vivo': ['admin', 'gerente'],
  '/custos': ['admin', 'gerente', 'rh'],
  '/dimensionamento': ['admin', 'gerente', 'rh'],
  '/regras': ['admin', 'gerente'],
  '/relatorio-layer': ['admin', 'gerente'],
  '/whatsapp': ['admin', 'gerente'],
  '/colaboradores': ['admin', 'gerente', 'supervisor', 'rh'],
  '/relatorios': ['admin', 'gerente'],
  '/rh': ['admin', 'rh'],
  '/recibo': ['admin', 'gerente', 'rh'],
  '/dph': ['admin', 'gerente', 'supervisor'],
  '/saldo': ['admin', 'gerente', 'supervisor'],
  '/kpis': ['admin', 'gerente'],
  '/ranking': ['admin', 'gerente', 'supervisor'],
  '/historico-presenca': ['admin', 'gerente', 'supervisor'],
  '/troca-turno': ['admin', 'gerente', 'supervisor', 'colaborador'],
  '/banco-horas': ['admin', 'gerente', 'supervisor', 'rh'],
  '/ferias': ['admin', 'gerente', 'rh', 'colaborador'],
  '/epis': ['admin', 'gerente', 'rh', 'supervisor'],
  '/clima': ['admin', 'gerente', 'rh', 'supervisor', 'colaborador'],
}

// Watches for urgent announcements after API data loads and shows toast notifications
function UrgentAnnouncementWatcher() {
  const { state } = useApp()
  const { toast } = useToast()
  const shownRef = useRef<Set<string>>(new Set())
  const prevApiReady = useRef(false)

  useEffect(() => {
    // Only trigger when apiReady transitions from false → true
    if (!state.apiReady || prevApiReady.current) return
    prevApiReady.current = true

    const loggedEmployeeId = state.currentUser.employeeId || ''
    const urgent = state.announcements.filter(
      (a) => a.priority === 'urgent' && !a.readBy.includes(loggedEmployeeId),
    )
    urgent.forEach((a) => {
      if (!shownRef.current.has(a.id)) {
        shownRef.current.add(a.id)
        toast('warning', `Aviso urgente: ${a.title}`)
      }
    })
  }, [state.apiReady, state.announcements, toast])

  return null
}

function RoleGuard({ path, children }: { path: string; children: ReactNode }) {
  const { state } = useApp()
  const role = state.currentUser.role
  const allowed = ROUTE_ACCESS[path]
  if (allowed && !allowed.includes(role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { state } = useApp()
  const isLoggedIn = state.currentUser.name !== ''

  if (!isLoggedIn) {
    return (
      <Routes>
        <Route path="/confirmar" element={<ConfirmarPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <>
      <UrgentAnnouncementWatcher />
      <Onboarding />
      <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <Routes>
        {/* Public page — no AppShell */}
        <Route path="/confirmar" element={<ConfirmarPage />} />

        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/dph" element={<RoleGuard path="/dph"><DPHPage /></RoleGuard>} />
          <Route path="/escala" element={<RoleGuard path="/escala"><EscalaPage /></RoleGuard>} />
          <Route path="/saldo" element={<RoleGuard path="/saldo"><SaldoPage /></RoleGuard>} />
          <Route path="/colaboradores" element={<RoleGuard path="/colaboradores"><ColaboradoresPage /></RoleGuard>} />
          <Route path="/ponto" element={<RoleGuard path="/ponto"><PontoPage /></RoleGuard>} />
          <Route path="/checkin" element={<RoleGuard path="/checkin"><CheckInPage /></RoleGuard>} />
          <Route path="/minha-area" element={<RoleGuard path="/minha-area"><MinhaAreaPage /></RoleGuard>} />
          <Route path="/produtividade" element={<RoleGuard path="/produtividade"><ProdutividadePage /></RoleGuard>} />
          <Route path="/kpis" element={<RoleGuard path="/kpis"><KPIsPage /></RoleGuard>} />
          <Route path="/ranking" element={<RoleGuard path="/ranking"><RankingPage /></RoleGuard>} />
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="/relatorios" element={<RoleGuard path="/relatorios"><RelatoriosPage /></RoleGuard>} />
          <Route path="/historico-presenca" element={<RoleGuard path="/historico-presenca"><HistoricoPresencaPage /></RoleGuard>} />
          <Route path="/troca-turno" element={<RoleGuard path="/troca-turno"><TrocaTurnoPage /></RoleGuard>} />
          <Route path="/banco-horas" element={<RoleGuard path="/banco-horas"><BancoHorasPage /></RoleGuard>} />
          <Route path="/feedback" element={<RoleGuard path="/feedback"><FeedbackPage /></RoleGuard>} />
          <Route path="/regras" element={<RoleGuard path="/regras"><RegrasDeOuroPage /></RoleGuard>} />
          <Route path="/dimensionamento" element={<RoleGuard path="/dimensionamento"><DimensionamentoPage /></RoleGuard>} />
          <Route path="/rh" element={<RoleGuard path="/rh"><RHDashboardPage /></RoleGuard>} />
          <Route path="/relatorio-layer" element={<RoleGuard path="/relatorio-layer"><RelatorioLayerPage /></RoleGuard>} />
          <Route path="/disponibilidade" element={<RoleGuard path="/disponibilidade"><DisponibilidadePage /></RoleGuard>} />
          <Route path="/dashboard-ao-vivo" element={<RoleGuard path="/dashboard-ao-vivo"><DashboardAoVivoPage /></RoleGuard>} />
          <Route path="/mural" element={<MuralPage />} />
          <Route path="/custos" element={<RoleGuard path="/custos"><CustosOperacionaisPage /></RoleGuard>} />
          <Route path="/avaliacao-turno" element={<RoleGuard path="/avaliacao-turno"><AvaliacaoTurnoPage /></RoleGuard>} />
          <Route path="/whatsapp" element={<RoleGuard path="/whatsapp"><WhatsAppPage /></RoleGuard>} />
          <Route path="/recibo" element={<RoleGuard path="/recibo"><ReciboPagamentoPage /></RoleGuard>} />
          <Route path="/convocacoes" element={<RoleGuard path="/convocacoes"><ConvocacoesPage /></RoleGuard>} />
          <Route path="/usuarios" element={<RoleGuard path="/usuarios"><UsuariosPage /></RoleGuard>} />
          <Route path="/ferias" element={<RoleGuard path="/ferias"><VacoesPage /></RoleGuard>} />
          <Route path="/epis" element={<RoleGuard path="/epis"><EPIsPage /></RoleGuard>} />
          <Route path="/clima" element={<RoleGuard path="/clima"><ClimaPesquisaPage /></RoleGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </>
  )
}

function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  )
}

export default App
