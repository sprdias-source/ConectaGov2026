import { useMemo, useState } from 'react'
import { FileSignature, Copy, Printer } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Field, Input, Select, Textarea, Button } from '../components/ui/FormControls'
import { useClients } from '../hooks/useClients'
import { useBiddings } from '../hooks/useBiddings'
import { useContracts } from '../hooks/useContracts'

function buildContractText(opts: {
  clientName: string
  clientCnpj: string
  clientAddress: string
  retentor: number
  comissao: number
  comarca: string
  clausulaAdicional: string
  biddingObjeto?: string
}) {
  return `CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS DE ASSESSORIA, CONSULTORIA E SUPORTE TÉCNICO EM DISPUTAS DE LICITAÇÕES PÚBLICAS

Pelo presente instrumento particular, de um lado:

CONTRATANTE: ${opts.clientName}, pessoa jurídica devidamente inscrita no CNPJ/MF sob o nº ${opts.clientCnpj || '[CNPJ não informado]'}, estabelecida no endereço ${opts.clientAddress || '[endereço não informado]'}, doravante denominada simplesmente CONTRATANTE.

E, de outro lado:

CONTRATADA: CONECTAGOV REPRESENTAÇÕES LTDA, pessoa jurídica de direito privado, neste ato representada por seus assessores diretores autorizados, doravante denominada simplesmente CONTRATADA.

As partes qualificadas acima têm, entre si, justo e acordado o presente instrumento de prestação de serviços técnicos, mediante as seguintes cláusulas e condições:

CLÁUSULA PRIMEIRA - DO OBJETO E DA ATUAÇÃO
Constitui objeto do presente instrumento a prestação de serviços contínuos de assessoria e consultoria em contratações públicas de interesse da CONTRATANTE${opts.biddingObjeto ? `, com atuação específica vinculada a: ${opts.biddingObjeto}` : ', englobando todas as oportunidades públicas de interesse e portfólio da CONTRATANTE'}, abrangendo:
a) Triagem eletrônica diária de editais e oportunidades públicas vinculadas ao CNAE e portfólio da CONTRATANTE;
b) Análise minuciosa de editais (aspectos habilitatórios, sanções, garantias e impugnações de clausulado ilegal);
c) Organização e auditoria preventiva dos envelopes ou arquivos digitais de habilitação jurídica, regularidade fiscal e qualificação técnica.

CLÁUSULA SEGUNDA - DA REMUNERAÇÃO
2.1. Pela prestação dos serviços, a CONTRATANTE pagará à CONTRATADA um retentor fixo mensal de R$ ${opts.retentor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (valor por extenso a critério das partes).
2.2. Adicionalmente, será devida à CONTRATADA uma comissão de êxito equivalente a ${opts.comissao}% (por cento) sobre o valor líquido de cada contrato público efetivamente celebrado e empenhado em favor da CONTRATANTE, decorrente da atuação da CONTRATADA.

CLÁUSULA TERCEIRA - DO FORO
As partes eleger o foro da Comarca de ${opts.comarca || '[comarca não informada]'} para dirimir quaisquer controvérsias oriundas do presente instrumento.

${opts.clausulaAdicional ? `CLÁUSULA ADICIONAL\n${opts.clausulaAdicional}\n\n` : ''}E por estarem assim justas e contratadas, as partes assinam o presente instrumento.`
}

export default function ContratosPage() {
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const { addContract, isLoading: savingContract } = useContracts()

  const [clientId, setClientId] = useState('')
  const [biddingId, setBiddingId] = useState('')
  const [retentor, setRetentor] = useState(1500)
  const [comissao, setComissao] = useState(2)
  const [comarca, setComarca] = useState('Sorocaba/SP')
  const [clausulaAdicional, setClausulaAdicional] = useState('')

  const client = clients.find((c) => c.id === clientId)
  const clientBiddings = biddings.filter((b) => b.clientId === clientId)
  const bidding = biddings.find((b) => b.id === biddingId)

  const contractText = useMemo(() => {
    if (!client) return ''
    return buildContractText({
      clientName: client.name,
      clientCnpj: client.cnpj ?? '',
      clientAddress: client.address ?? '',
      retentor,
      comissao,
      comarca,
      clausulaAdicional,
      biddingObjeto: bidding?.objeto,
    })
  }, [client, retentor, comissao, comarca, clausulaAdicional, bidding])

  const handleSave = () => {
    if (!client) return
    addContract.mutate({
      clientId: client.id,
      biddingId: biddingId || null,
      retentorFixoMensal: retentor,
      comissaoExito: comissao,
      comarcaForo: comarca,
      clausulaAdicional: clausulaAdicional || null,
      conteudoGerado: contractText,
    })
  }

  const copyText = () => navigator.clipboard.writeText(contractText)

  return (
    <div className="pb-10">
      <PageHeader title="Módulo de Contratos" subtitle="Gere contratos jurídicos de prestação de serviços com preenchimento automático" icon={FileSignature} />

      <div className="px-6 mt-4 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-base-100 mb-4">Parâmetros de Adesão</h3>
          <div className="flex flex-col gap-4">
            <Field label="1. Cliente Contratante" required>
              <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setBiddingId('') }}>
                <option value="">Selecione o cliente...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            <Field label="2. Retentor Fixo Mensal (R$)">
              <Input type="number" value={retentor} onChange={(e) => setRetentor(parseFloat(e.target.value) || 0)} />
            </Field>

            <Field label="3. Comissão de Êxito / Sucesso (%)">
              <Input type="number" step="0.1" value={comissao} onChange={(e) => setComissao(parseFloat(e.target.value) || 0)} />
            </Field>

            <Field label="4. Vincular a uma Licitação (opcional)">
              <Select value={biddingId} onChange={(e) => setBiddingId(e.target.value)}>
                <option value="">Todas as licitações gerais (Contrato Global)</option>
                {clientBiddings.map((b) => <option key={b.id} value={b.id}>{b.objeto}</option>)}
              </Select>
            </Field>

            <Field label="5. Comarca do Foro">
              <Input value={comarca} onChange={(e) => setComarca(e.target.value)} />
            </Field>

            <Field label="6. Cláusula Adicional Personalizada">
              <Textarea rows={3} value={clausulaAdicional} onChange={(e) => setClausulaAdicional(e.target.value)} placeholder="Texto adicional opcional para incluir no contrato" />
            </Field>

            <Button onClick={handleSave} disabled={!client || savingContract}>
              {savingContract ? 'Salvando...' : 'Salvar Contrato Gerado'}
            </Button>
          </div>
        </Card>

        <Card className="p-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-base-800">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-accent-400 font-bold">Visualizador de Documento</p>
              <h3 className="font-display font-bold text-sm text-base-100">
                {client ? `Contrato de Consultoria - ${client.name}` : 'Selecione um cliente para gerar o contrato'}
              </h3>
            </div>
            {client && (
              <div className="flex gap-2">
                <button onClick={copyText} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition">
                  <Copy className="w-3.5 h-3.5" /> Copiar Texto
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
                  <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
                </button>
              </div>
            )}
          </div>
          <div className="p-6 overflow-y-auto max-h-[640px] bg-white text-slate-900">
            {client ? (
              <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed">{contractText}</pre>
            ) : (
              <div className="text-slate-400 text-sm py-16 text-center">Nenhum documento gerado ainda.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
