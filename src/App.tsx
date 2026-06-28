import { Routes, Route } from 'react-router-dom'
import RequireAuth from './components/layout/RequireAuth'
import AppShell from './components/layout/AppShell'
import DashboardPage from './pages/DashboardPage'
import CadastrosPage from './pages/CadastrosPage'
import ContasPage from './pages/ContasPage'
import FluxoCaixaPage from './pages/FluxoCaixaPage'
import RelatoriosPage from './pages/RelatoriosPage'
import RecibosPage from './pages/RecibosPage'
import ContratosPage from './pages/ContratosPage'
import FuncionariosPage from './pages/FuncionariosPage'
import ContabilidadePage from './pages/ContabilidadePage'
import { useRecurringEngine } from './hooks/useRecurringEngine'

export default function App() {
  useRecurringEngine()

  return (
    <RequireAuth>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cadastros" element={<CadastrosPage />} />
          <Route path="/contas" element={<ContasPage />} />
          <Route path="/fluxo" element={<FluxoCaixaPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
          <Route path="/recibos" element={<RecibosPage />} />
          <Route path="/contratos" element={<ContratosPage />} />
          <Route path="/funcionarios" element={<FuncionariosPage />} />
          <Route path="/contabilidade" element={<ContabilidadePage />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  )
}
