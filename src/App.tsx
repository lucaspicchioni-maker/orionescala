import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
          <Route path="/dph" element={<DPHPage />} />
          <Route path="/escala" element={<EscalaPage />} />
          <Route path="/saldo" element={<SaldoPage />} />
          <Route path="/colaboradores" element={<ColaboradoresPage />} />
          <Route path="/ponto" element={<PontoPage />} />
          <Route path="/checkin" element={<CheckInPage />} />
          <Route path="/minha-area" element={<MinhaAreaPage />} />
          <Route path="/produtividade" element={<ProdutividadePage />} />
          <Route path="/kpis" element={<KPIsPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
          <Route path="/historico-presenca" element={<HistoricoPresencaPage />} />
          <Route path="/troca-turno" element={<TrocaTurnoPage />} />
          <Route path="/banco-horas" element={<BancoHorasPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/regras" element={<RegrasDeOuroPage />} />
          <Route path="/dimensionamento" element={<DimensionamentoPage />} />
          <Route path="/rh" element={<RHDashboardPage />} />
          <Route path="/relatorio-layer" element={<RelatorioLayerPage />} />
          <Route path="/disponibilidade" element={<DisponibilidadePage />} />
          <Route path="/dashboard-ao-vivo" element={<DashboardAoVivoPage />} />
          <Route path="/mural" element={<MuralPage />} />
          <Route path="/custos" element={<CustosOperacionaisPage />} />
          <Route path="/avaliacao-turno" element={<AvaliacaoTurnoPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
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
