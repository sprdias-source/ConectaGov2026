import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FolderKanban, Users, Gavel, Wallet, FileText, Globe, Send, Bot, Calculator } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Select } from '../components/ui/FormControls'
import { useClients } from '../hooks/useClients'
import { useBiddings } from '../hooks/useBiddings'
import { useFinancialAccounts } from '../hooks/useFinancialAccounts'
import ClientsTab from '../components/cadastros/ClientsTab'
import BiddingsTab from '../components/cadastros/BiddingsTab'
import AccountsTab from '../components/cadastros/AccountsTab'
import HabilitacaoChecklist from '../components/documentos/HabilitacaoChecklist'
import ClientPlatformsPanel from '../components/plataformas/ClientPlatformsPanel'
import PlatformsCatalogPanel from '../components/plataformas/PlatformsCatalogPanel'
import OportunidadesPanel from '../components/oportunidades/OportunidadesPanel'
import LicitaiEditaisPanel from '../components/licitei/LicitaiEditaisPanel'
import PricingProfilesPanel from '../components/precificacao/PricingProfilesPanel'

type Tab = 'clientes' | 'licitacoes' | 'contas' | 'documentos' | 'plataformas' | 'oportunidades' | 'licitei' | 'precificacao'
const TABS_VALIDAS: Tab[] = ['clientes', 'licitacoes', 'contas', 'documentos', 'plataformas', 'oportunidades', 'licitei', 'precificacao']

const TABS_INFO: Record<Tab, { label: string; icon: typeof Users }> = {
  clientes: { label: 'Clientes', icon: Users },
  licitacoes: { label: 'Licitações', icon: Gavel },
  contas: { label: 'Contas & Cartões', icon: Wallet },
  documentos: { label: 'Documentos de Habilitação', icon: FileText },
  plataformas: { label: 'Plataformas', icon: Globe },
  oportunidades: { label: 'Oportunidades', icon: Send },
  licitei: { label: 'Editais Licitei', icon: Bot },
  precificacao: { label: 'Precificação', icon: Calculator },
}

// A ordem das abas é só uma preferência de exibição — guardada no
// navegador, não no banco (não é dado da conta, é do dispositivo).
const ORDEM_ABAS_STORAGE_KEY = 'conectagov.cadastros.ordemAbas'

function ordemAbasSalva(): Tab[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(ORDEM_ABAS_STORAGE_KEY) ?? 'null')
    if (Array.isArray(salvo) && salvo.length === TABS_VALIDAS.length && TABS_VALIDAS.every((t) => salvo.includes(t))) {
      return salvo as Tab[]
    }
  } catch {
    // localStorage inacessível (modo privado etc.) — cai pra ordem padrão
  }
  return TABS_VALIDAS
}

export default function CadastrosPage() {
  const [searchParams] = useSearchParams()
  // Permite chegar direto numa aba com um cliente já selecionado via link
  // (ex: um alerta de certidão/plataforma vencendo em
  // ?tab=documentos&clientId=...) — só aceita chaves reais de Tab.
  const tabInicial = TABS_VALIDAS.find((t) => t === searchParams.get('tab')) ?? 'clientes'
  const [tab, setTab] = useState<Tab>(tabInicial)
  const [selectedClientId, setSelectedClientId] = useState<string>(searchParams.get('clientId') ?? '')
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const { accounts } = useFinancialAccounts()

  const [ordemAbas, setOrdemAbas] = useState<Tab[]>(ordemAbasSalva)
  const [abaArrastando, setAbaArrastando] = useState<Tab | null>(null)
  // Ref (não state) de propósito: precisa estar atualizado de forma síncrona
  // pro clique que o navegador dispara logo depois do pointerup de um
  // arraste — se fosse state, o clique podia ler o valor de antes de
  // reordenar e trocar de aba sem querer assim que o usuário soltasse.
  const houveArrasteRef = useRef(false)
  // Só conta como arraste depois de mover alguns pixels — sem isso, um
  // toque rápido (tap) no celular já dispara pointermove com 1px de
  // diferença e a aba nunca abriria com um clique normal.
  const inicioArrasteRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    try {
      localStorage.setItem(ORDEM_ABAS_STORAGE_KEY, JSON.stringify(ordemAbas))
    } catch {
      // Navegação privada, cota estourada, etc. — a ordem continua valendo
      // na sessão atual, só não persiste pra próxima.
    }
  }, [ordemAbas])

  const contagens: Partial<Record<Tab, number>> = {
    clientes: clients.length,
    licitacoes: biddings.length,
    contas: accounts.length,
  }

  // Reordenação por arraste, só com mouse — no toque, o mesmo gesto
  // (arrastar o dedo pra o lado) já é usado pra ROLAR a lista de abas quando
  // ela não cabe na tela toda, e captura de ponteiro nesse elemento
  // (necessária pro arraste) desativa a rolagem nativa do navegador nele,
  // deixando as abas extras inalcançáveis no celular. Sem `touch-none` fixo
  // e sem capturar ponteiro de toque, o navegador cuida da rolagem sozinho
  // e o arraste continua funcionando normalmente com mouse no desktop.
  const handlePointerDownAba = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return
    houveArrasteRef.current = false
    inicioArrasteRef.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMoveAba = (key: Tab) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - inicioArrasteRef.current.x
    const dy = e.clientY - inicioArrasteRef.current.y
    if (!houveArrasteRef.current && Math.hypot(dx, dy) < 6) return
    houveArrasteRef.current = true
    if (abaArrastando !== key) setAbaArrastando(key)

    const alvo = document.elementsFromPoint(e.clientX, e.clientY)
      .find((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.tabKey && el.dataset.tabKey !== key)
    if (!alvo) return
    const overKey = alvo.dataset.tabKey as Tab
    const rect = alvo.getBoundingClientRect()
    const antesDoAlvo = e.clientX < rect.left + rect.width / 2

    setOrdemAbas((atual) => {
      const semArrastada = atual.filter((k) => k !== key)
      const idxAlvo = semArrastada.indexOf(overKey)
      const novo = [...semArrastada]
      novo.splice(antesDoAlvo ? idxAlvo : idxAlvo + 1, 0, key)
      return novo
    })
  }

  const handlePointerUpAba = () => setAbaArrastando(null)

  const handleClickAba = (key: Tab) => () => {
    if (houveArrasteRef.current) {
      houveArrasteRef.current = false
      return
    }
    setTab(key)
  }

  const selectedClient = clients.find((c) => c.id === selectedClientId)

  return (
    <div className="pb-10">
      <PageHeader title="Cadastros" subtitle="Clientes, licitações e contas financeiras" icon={FolderKanban} />

      <div className="px-6 mt-3">
        <div className="flex gap-1.5 border-b border-base-800 mb-5 overflow-x-auto no-scrollbar">
          {ordemAbas.map((key) => {
            const info = TABS_INFO[key]
            const contagem = contagens[key]
            return (
              <button
                key={key}
                data-tab-key={key}
                onClick={handleClickAba(key)}
                onPointerDown={handlePointerDownAba}
                onPointerMove={handlePointerMoveAba(key)}
                onPointerUp={handlePointerUpAba}
                onPointerCancel={handlePointerUpAba}
                title="Arraste pra reordenar as abas (no computador)"
                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition border-b-2 -mb-px select-none cursor-grab active:cursor-grabbing ${
                  abaArrastando === key ? 'opacity-60' : ''
                } ${
                  tab === key
                    ? 'text-accent-300 border-accent-400'
                    : 'text-base-400 border-transparent hover:text-base-200'
                }`}
              >
                <info.icon className="w-4 h-4" />
                {info.label}
                {contagem !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-accent-500/15 text-accent-300' : 'bg-base-800 text-base-500'}`}>
                    {contagem}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {tab === 'clientes' && <ClientsTab />}
        {tab === 'licitacoes' && <BiddingsTab />}
        {tab === 'contas' && <AccountsTab />}

        {tab === 'documentos' && (
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-base-500 font-bold mb-2">
                Selecione o cliente
              </p>
              <Select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="max-w-sm"
              >
                <option value="">— Selecione um cliente —</option>
                {clients.filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Card>

            {selectedClient ? (
              <Card className="p-5">
                <HabilitacaoChecklist
                  clientId={selectedClient.id}
                  clientName={selectedClient.name}
                  cnpj={selectedClient.cnpj ?? undefined}
                />
              </Card>
            ) : (
              <div className="text-center py-12 text-base-500 text-[13px]">
                Selecione um cliente acima para gerenciar os documentos de habilitação.
              </div>
            )}
          </div>
        )}

        {tab === 'plataformas' && (
          <div className="flex flex-col gap-6">
            <Card className="p-5">
              <PlatformsCatalogPanel />
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-base-500 font-bold mb-2">
                  Vincular cliente a uma plataforma — selecione o cliente
                </p>
                <Select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="max-w-sm"
                >
                  <option value="">— Selecione um cliente —</option>
                  {clients.filter((c) => c.isActive).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Card>

              {selectedClient ? (
                <Card className="p-5">
                  <ClientPlatformsPanel clientId={selectedClient.id} clientName={selectedClient.name} />
                </Card>
              ) : (
                <div className="text-center py-12 text-base-500 text-[13px]">
                  Selecione um cliente acima pra vincular a uma plataforma do catálogo.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'oportunidades' && <OportunidadesPanel />}
        {tab === 'licitei' && <LicitaiEditaisPanel />}
        {tab === 'precificacao' && (
          <Card className="p-5">
            <PricingProfilesPanel />
          </Card>
        )}
      </div>
    </div>
  )
}
