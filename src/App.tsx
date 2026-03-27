import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { AppProvider, useApp } from '@/store/AppContext'
import { Onboarding } from '@/components/Onboarding'
import DPHPage from '@/pages/DPHPage'
import EscalaPage from '@/pages/EscalaPage'
import SaldoPage from '@/pages/SaldoPage'
import ColaboradoresPage from '@/pages/ColaboradoresPage'
import KPIsPage from '@/pages/KPIsPage'
import RankingPage from '@/pages/RankingPage'
import PontoPage from '@/pages/PontoPage'
import CheckInPage from '@/pages/CheckInPage'
import MinhaAreaPage from '@/pages/MinhaAreaPage'
import ProdutividadePage from '@/pages/ProdutividadePage'
import ConfiguracoesPage from '@/pages/ConfiguracoesPage'
import LoginPage from '@/pages/LoginPage'
import HomePage from '@/pages/HomePage'
import RelatoriosPage from '@/pages/RelatoriosPage'
import HistoricoPresencaPage from '@/pages/HistoricoPresencaPage'
import TrocaTurnoPage from '@/pages/TrocaTurnoPage'
import BancoHorasPage from '@/pages/BancoHorasPage'
import FeedbackPage from '@/pages/FeedbackPage'
import RegrasDeOuroPage from '@/pages/RegrasDeOuroPage'
import DimensionamentoPage from '@/pages/DimensionamentoPage'
import RHDashboardPage from '@/pages/RHDashboardPage'
import RelatorioLayerPage from '@/pages/RelatorioLayerPage'
import DisponibilidadePage from '@/pages/DisponibilidadePage'
import DashboardAoVivoPage from '@/pages/DashboardAoVivoPage'
import MuralPage from '@/pages/MuralPage'
import CustosOperacionaisPage from '@/pages/CustosOperacionaisPage'
import AvaliacaoTurnoPage from '@/pages/AvaliacaoTurnoPage'
import WhatsAppPage from '@/pages/WhatsAppPage'

type Role = 'colaborador' | 'supervisor' | 'gerente' | 'rh' | 'admin'

// Route access control: which roles can access each route
const ROUTE_ACCESS: Record<string, Role[]> = {
  // Everyone
  '/': ['admin', 'gerente', 'supervisor', 'rh', 'colaborador'],
  '/mural': ['admin', 'gerente', 'supervisor', 'rh', 'colaborador'],
  '/configuracoes': ['admin', 'gerente', 'supervisor', 'rh', 'colaborador'],

  // Colaborador specific
  '/minha-area': ['admin', 'gerente', 'supervisor', 'colaborador'],
  '/checkin': ['admin', 'supervisor', 'colaborador'],
  '/disponibilidade': ['admin', 'colaborador'],
  '/avaliacao-turno': ['admin', 'colaborador'],

  // Supervisor + up
  '/escala': ['admin', 'gerente', 'supervisor'],
  '/ponto': ['admin', 'gerente', 'supervisor'],
  '/produtividade': ['admin', 'gerente', 'supervisor'],
  '/feedback': ['admin', 'gerente', 'supervisor'],

  // Gerente + admin
  '/dashboard-ao-vivo': ['admin', 'gerente'],
  '/custos': ['admin', 'gerente', 'rh'],
  '/dimensionamento': ['admin', 'gerente', 'rh'],
  '/regras': ['admin', 'gerente'],
  '/relatorio-layer': ['admin', 'gerente'],
  '/whatsapp': ['admin', 'gerente'],
  '/colaboradores': ['admin', 'gerente', 'supervisor', 'rh'],
  '/relatorios': ['admin', 'gerente'],

  // RH specific
  '/rh': ['admin', 'rh'],

  // Misc (accessible to managers)
  '/dph': ['admin', 'gerente', 'supervisor'],
  '/saldo': ['admin', 'gerente', 'supervisor'],
  '/kpis': ['admin', 'gerente'],
  '/ranking': ['admin', 'gerente', 'supervisor'],
  '/historico-presenca': ['admin', 'gerente', 'supervisor'],
  '/troca-turno': ['admin', 'gerente', 'supervisor', 'colaborador'],
  '/banco-horas': ['admin', 'gerente', 'supervisor', 'rh'],
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
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <>
      <Onboarding />
      <Routes>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
