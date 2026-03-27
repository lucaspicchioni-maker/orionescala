import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AppProvider } from '@/store/AppContext'
import DPHPage from '@/pages/DPHPage'
import EscalaPage from '@/pages/EscalaPage'
import SaldoPage from '@/pages/SaldoPage'
import ColaboradoresPage from '@/pages/ColaboradoresPage'
import KPIsPage from '@/pages/KPIsPage'
import RankingPage from '@/pages/RankingPage'

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
            <Route path="/kpis" element={<KPIsPage />} />
            <Route path="/ranking" element={<RankingPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
