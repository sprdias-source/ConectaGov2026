import { Routes, Route } from 'react-router-dom'
import { AlertTriangle, X, WifiOff, Loader2 } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import RequireAuth from './components/layout/RequireAuth'
import AppShell from './components/layout/AppShell'
import ScrollToTop from './components/layout/ScrollToTop'
import { useRecurringEngine } from './hooks/useRecurringEngine'
import { useOnlineStatus } from './hooks/useOnlineStatus'

// Code splitting por rota — antes disso, as ~29 páginas eram todas
// importadas de uma vez só num bundle único (>500KB), mesmo quando o
// usuário só ia usar uma tela. Com import() dinâmico, o Vite gera um
// arquivo separado por página, carregado sob demanda ao navegar — melhora
// bastante o primeiro carregamento, principalmente em conexão de celular.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CadastrosPage = lazy(() => import('./pages/CadastrosPage'))
const ContasPage = lazy(() => import('./pages/ContasPage'))
const FluxoCaixaPage = lazy(() => import('./pages/FluxoCaixaPage'))
const RelatoriosPage = lazy(() => import('./pages/RelatoriosPage'))
const RecibosPage = lazy(() => import('./pages/RecibosPage'))
const ContratosPage = lazy(() => import('./pages/ContratosPage'))
const FuncionariosPage = lazy(() => import('./pages/FuncionariosPage'))
const ContabilidadePage = lazy(() => import('./pages/ContabilidadePage'))
const DiagnosticoPage = lazy(() => import('./pages/DiagnosticoPage'))
const BIConcorrenciaPage = lazy(() => import('./pages/BIConcorrenciaPage'))
const ExtratoOFXPage = lazy(() => import('./pages/ExtratoOFXPage'))
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'))
const MinhaContaPage = lazy(() => import('./pages/MinhaContaPage'))
const CentralPrazosPage = lazy(() => import('./pages/CentralPrazosPage'))
const RentabilidadePage = lazy(() => import('./pages/RentabilidadePage'))
const EmissaoNfsePage = lazy(() => import('./pages/EmissaoNfsePage'))
const PendenciasPage = lazy(() => import('./pages/PendenciasPage'))
const ModelosPage = lazy(() => import('./pages/ModelosPage'))
const CalculadoraPrecoPage = lazy(() => import('./pages/CalculadoraPrecoPage'))
const ExecucaoContratosPage = lazy(() => import('./pages/ExecucaoContratosPage'))
const AgendaPage = lazy(() => import('./pages/AgendaPage'))
const KanbanLicitacoesPage = lazy(() => import('./pages/KanbanLicitacoesPage'))
const LicitacaoPage = lazy(() => import('./pages/LicitacaoPage'))
const HojePage = lazy(() => import('./pages/HojePage'))
const PoliticaPrivacidadePage = lazy(() => import('./pages/PoliticaPrivacidadePage'))

function CarregandoRota() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
    </div>
  )
}

// Página pública, acessível sem login — precisa ficar fora de <RequireAuth>
// (ver comentário no topo de PoliticaPrivacidadePage.tsx pro motivo).
function RotasPublicas() {
  return (
    <Suspense fallback={<CarregandoRota />}>
      <Routes>
        <Route path="/politica-de-privacidade" element={<PoliticaPrivacidadePage />} />
        <Route path="/*" element={<RotasAutenticadas />} />
      </Routes>
    </Suspense>
  )
}

function RotasAutenticadas() {
  const { lastError } = useRecurringEngine()
  const [dismissed, setDismissed] = useState(false)
  const isOnline = useOnlineStatus()
  return (
    <RequireAuth>
      <ScrollToTop />
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
        <Suspense fallback={<CarregandoRota />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/hoje" element={<HojePage />} />
            <Route path="/agenda" element={<AgendaPage />} />
            <Route path="/kanban" element={<KanbanLicitacoesPage />} />
            <Route path="/licitacoes/:id" element={<LicitacaoPage />} />
            <Route path="/central-prazos" element={<CentralPrazosPage />} />
            <Route path="/pendencias" element={<PendenciasPage />} />
            <Route path="/modelos" element={<ModelosPage />} />
            <Route path="/calculadora-preco" element={<CalculadoraPrecoPage />} />
            <Route path="/execucao-contratos" element={<ExecucaoContratosPage />} />
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
            <Route path="/emissao-nfse" element={<EmissaoNfsePage />} />
            <Route path="/extrato" element={<ExtratoOFXPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/minha-conta" element={<MinhaContaPage />} />
          </Routes>
        </Suspense>
      </AppShell>
    </RequireAuth>
  )
}

export default function App() {
  return <RotasPublicas />
}
