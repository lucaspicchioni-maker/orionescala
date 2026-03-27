import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AppProvider } from '@/store/AppContext'
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

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dph" replace />} />
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
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
