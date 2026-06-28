import { Routes, Route } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
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
import { useRecurringEngine } from './hooks/useRecurringEngine'

export default function App() {
  const { lastError } = useRecurringEngine()
  const [dismissed, setDismissed] = useState(false)

  return (
    <RequireAuth>
      <AppShell>
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
          <Route path="/cadastros" element={<CadastrosPage />} />
          <Route path="/contas" element={<ContasPage />} />
          <Route path="/fluxo" element={<FluxoCaixaPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
          <Route path="/recibos" element={<RecibosPage />} />
          <Route path="/contratos" element={<ContratosPage />} />
          <Route path="/funcionarios" element={<FuncionariosPage />} />
          <Route path="/contabilidade" element={<ContabilidadePage />} />
          <Route path="/diagnostico" element={<DiagnosticoPage />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  )
}
