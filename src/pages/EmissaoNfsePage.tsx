import { useState } from 'react'
import { Receipt, Settings, ExternalLink, Save, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Input, Select, Button } from '../components/ui/FormControls'
import { useClients } from '../hooks/useClients'
import { useNfseConfig, type NfseConfigPadrao } from '../hooks/useNfseConfig'
import { todayLocalISO } from '../lib/dateUtils'

const URL_PORTAL_NFSE = 'https://webapp1-vacaria.cidade360.cloud/NFSe.Portal/Prestador/Nota/Index'

export default function EmissaoNfsePage() {
  const { clients } = useClients()
  const { config, saveConfig, isLoading: loadingConfig } = useNfseConfig()

  const [configAberta, setConfigAberta] = useState(false)
  const [configEditavel, setConfigEditavel] = useState<NfseConfigPadrao>(config)

  const [clientId, setClientId] = useState('')
  const [valorServico, setValorServico] = useState('')
  const [descricao, setDescricao] = useState(config.descricaoPadrao)
  const [dataExecucao, setDataExecucao] = useState(todayLocalISO())

  const clienteSelecionado = clients.find((c) => c.id === clientId)

  // Sincroniza o formulário de edição sempre que a config real carregar
  // (evita mostrar valores padrão "piscando" antes do fetch terminar).
  if (!loadingConfig && configEditavel.itemServico !== config.itemServico && !configAberta) {
    // Só ressincroniza quando o painel de config está fechado (pra não
    // sobrescrever o que o usuário está digitando se ele tiver aberto).
    setConfigEditavel(config)
  }

  const handlePreencherNfse = () => {
    if (!clienteSelecionado || !valorServico) return

    const payload = {
      tomadorDocumento: clienteSelecionado.cnpj ?? '',
      tomadorNome: clienteSelecionado.name,
      tomadorEndereco: clienteSelecionado.address ?? '',
      tomadorBairro: clienteSelecionado.bairro ?? '',
      tomadorCidade: clienteSelecionado.cidade ?? '',
      tomadorCep: clienteSelecionado.cep ?? '',
      tomadorEmail: clienteSelecionado.email ?? '',
      tomadorFone: clienteSelecionado.phone ?? '',
      valorServico,
      descricao,
      dataExecucao,
      itemServico: config.itemServico,
      codTributacaoNacional: config.codTributacaoNacional,
      codTributacaoMunicipal: config.codTributacaoMunicipal,
      exigibilidadeIss: config.exigibilidadeIss,
    }

    // Mesmo esquema já usado no bookmarklet de preenchimento de CNPJ: os
    // dados vão embutidos na própria URL (hash), sem depender de
    // clipboard — o bookmarklet (a construir) lê esse hash e preenche o
    // formulário, deixando a conferência e o clique final por conta do
    // usuário.
    const hash = `conectagov_nfse=${encodeURIComponent(btoa(JSON.stringify(payload)))}`
    window.open(`${URL_PORTAL_NFSE}#${hash}`, '_blank')
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Emissão de NFS-e"
        subtitle="Prepara os dados da nota e abre o portal da Prefeitura de Vacaria pra você conferir e emitir"
        icon={Receipt}
      />

      <div className="px-6 mt-4 flex flex-col gap-4 max-w-2xl">
        <div className="bg-warning-500/10 border border-warning-500/25 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-warning-300">
            O preenchimento automático dos campos dentro do portal da prefeitura ainda está sendo construído.
            Por enquanto, esta tela já prepara os dados — a próxima etapa vai fazer o portal abrir com tudo pronto pra conferência.
          </p>
        </div>

        <Card className="p-4">
          <button
            onClick={() => setConfigAberta((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-accent-400" />
              <h3 className="text-sm font-bold text-base-100">Configuração Padrão do Serviço</h3>
            </div>
            {configAberta ? <ChevronUp className="w-4 h-4 text-base-500" /> : <ChevronDown className="w-4 h-4 text-base-500" />}
          </button>
          <p className="text-[12px] text-base-500 mt-1">
            Códigos de classificação tributária usados em toda nota. Só precisa mudar se o tipo de serviço prestado mudar.
          </p>

          {configAberta && (
            <div className="flex flex-col gap-3 mt-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Item de Serviço (LC 116)</label>
                <Input value={configEditavel.itemServico} onChange={(e) => setConfigEditavel({ ...configEditavel, itemServico: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Código de Tributação Nacional</label>
                <Input value={configEditavel.codTributacaoNacional} onChange={(e) => setConfigEditavel({ ...configEditavel, codTributacaoNacional: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Código de Tributação Municipal</label>
                <Input value={configEditavel.codTributacaoMunicipal} onChange={(e) => setConfigEditavel({ ...configEditavel, codTributacaoMunicipal: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Exigibilidade do ISS</label>
                <Input value={configEditavel.exigibilidadeIss} onChange={(e) => setConfigEditavel({ ...configEditavel, exigibilidadeIss: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Descrição Padrão do Serviço</label>
                <textarea
                  value={configEditavel.descricaoPadrao}
                  onChange={(e) => setConfigEditavel({ ...configEditavel, descricaoPadrao: e.target.value })}
                  rows={3}
                  className="w-full bg-base-900 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
              <Button
                onClick={() => saveConfig.mutate(configEditavel, { onSuccess: () => setConfigAberta(false) })}
                disabled={saveConfig.isPending}
                className="self-start"
              >
                <Save className="w-3.5 h-3.5" /> {saveConfig.isPending ? 'Salvando...' : 'Salvar Configuração'}
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-bold text-base-100 mb-3">Dados da Nota</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Cliente (Tomador)</label>
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Selecione o cliente...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Valor do Serviço (R$)</label>
                <Input type="number" step="0.01" value={valorServico} onChange={(e) => setValorServico(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Data de Execução</label>
                <Input type="date" value={dataExecucao} onChange={(e) => setDataExecucao(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Descrição do Serviço</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                className="w-full bg-base-900 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>

            <Button
              onClick={handlePreencherNfse}
              disabled={!clientId || !valorServico}
              className="self-start"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Preencher NFS-e no Portal da Prefeitura
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
