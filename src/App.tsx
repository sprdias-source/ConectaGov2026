import { Routes, Route } from 'react-router-dom'
import { AlertTriangle, X, WifiOff } from 'lucide-react'
import { useState } from 'react'
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
import DiagnosticoPage from './pages/DiagnosticoPage'
import BIConcorrenciaPage from './pages/BIConcorrenciaPage'
import ExtratoOFXPage from './pages/ExtratoOFXPage'
import UsuariosPage from './pages/UsuariosPage'
import MinhaContaPage from './pages/MinhaContaPage'
import CentralPrazosPage from './pages/CentralPrazosPage'
import RentabilidadePage from './pages/RentabilidadePage'
import { useRecurringEngine } from './hooks/useRecurringEngine'
import { useOnlineStatus } from './hooks/useOnlineStatus'
export default function App() {
  const { lastError } = useRecurringEngine()
  const [dismissed, setDismissed] = useState(false)
  const isOnline = useOnlineStatus()
  return (
    <RequireAuth>
      <AppShell>
        {!isOnline && (
          <div className="bg-warning-500/15 border-b border-warning-500/30 px-4 py-2.5 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-warning-400 shrink-0" />
            <p className="text-[12px] text-warning-300 flex-1">
              Sem conexão com a internet. Suas alterações não estão sendo salvas até a conexão voltar — evite fechar a aba.
            </p>
          </div>
        )}
        {lastError && !dismissed && (
          <div className="bg-negative-500/10 border-b border-negative-500/30 px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-negative-400 shrink-0" />
            <p className="text-[12px] text-negative-300 flex-1">
              A automação de lançamentos recorrentes encontrou um problema: {lastError}
            </p>
            <button onClick={() => setDismissed(true)} className="text-negative-400 hover:text-negative-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/central-prazos" element={<CentralPrazosPage />} />
          <Route path="/cadastros" element={<CadastrosPage />} />
          <Route path="/contas" element={<ContasPage />} />
          <Route path="/fluxo" element={<FluxoCaixaPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
          <Route path="/recibos" element={<RecibosPage />} />
          <Route path="/contratos" element={<ContratosPage />} />
          <Route path="/funcionarios" element={<FuncionariosPage />} />
          <Route path="/contabilidade" element={<ContabilidadePage />} />
          <Route path="/diagnostico" element={<DiagnosticoPage />} />
          <Route path="/bi-concorrencia" element={<BIConcorrenciaPage />} />
          <Route path="/rentabilidade" element={<RentabilidadePage />} />
          <Route path="/extrato" element={<ExtratoOFXPage />} />
          <Route path="/usuarios" element={<UsuariosPage />} />
          <Route path="/minha-conta" element={<MinhaContaPage />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  )
}
