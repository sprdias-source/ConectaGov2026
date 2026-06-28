import { useState } from 'react'
import { Receipt, FileText, Printer, DollarSign } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Field, Input, Select, Textarea, Button } from '../components/ui/FormControls'
import DocumentUploader from '../components/ui/DocumentUploader'
import { useClients } from '../hooks/useClients'
import { useReceipts } from '../hooks/useReceipts'
import { formatBRL } from '../hooks/useAccountBalances'

export default function RecibosPage() {
  const { clients } = useClients()
  const { addReceipt, isSaving } = useReceipts()
  const [kind, setKind] = useState<'Recibo' | 'Orcamento'>('Recibo')
  const [clientId, setClientId] = useState('')
  const [value, setValue] = useState(0)
  const [city, setCity] = useState('Sorocaba')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('Mensalidade de Assessoria Técnica e Operacional em Licitações Públicas')

  const client = clients.find((c) => c.id === clientId)
  const canGenerate = !!client && value > 0

  const handleGenerate = () => {
    addReceipt.mutate({ clientId: clientId || null, kind, value, city, issueDate, description })
  }

  return (
    <div className="pb-10">
      <PageHeader title="Faturamento, Orçamentos & Recibos" subtitle="Emita recibos profissionais ou propostas de prestação de serviço" icon={Receipt} />

      <div className="px-6 mt-4">
        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => setKind('Recibo')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${kind === 'Recibo' ? 'bg-accent-500 text-base-950' : 'bg-base-850 text-base-300 border border-base-700'}`}
          >
            <DollarSign className="w-4 h-4" /> Emitir Recibos
          </button>
          <button
            onClick={() => setKind('Orcamento')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${kind === 'Orcamento' ? 'bg-accent-500 text-base-950' : 'bg-base-850 text-base-300 border border-base-700'}`}
          >
            <FileText className="w-4 h-4" /> Criar Orçamento
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-base-100 mb-4">Variáveis do Documento</h3>
            <div className="flex flex-col gap-4">
              <Field label="Cliente Vinculado">
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Selecione o cliente...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Valor (R$)" required>
                  <Input type="number" step="0.01" value={value || ''} onChange={(e) => setValue(parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Data de Emissão">
                  <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </Field>
              </div>
              <Field label="Cidade de Emissão">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="Histórico / Descritivo do Serviço">
                <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Button onClick={handleGenerate} disabled={!canGenerate || isSaving}>
                {isSaving ? 'Gerando...' : `Gerar ${kind === 'Recibo' ? 'Recibo' : 'Orçamento'}`}
              </Button>
            </div>
          </Card>

          <Card className="p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-base-100">Pré-visualização</h3>
              {canGenerate && (
                <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-400 hover:text-base-200">
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
              )}
            </div>
            {!canGenerate ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-base-500 py-10">
                <DollarSign className="w-8 h-8 mb-3 opacity-40" />
                <p className="text-sm">Selecione um cliente e informe o valor para simular a visualização.</p>
              </div>
            ) : (
              <div className="bg-white text-slate-900 rounded-lg p-6 flex-1 font-serif">
                <h4 className="text-center font-bold text-lg uppercase mb-1">{kind === 'Recibo' ? 'Recibo de Prestação de Serviços' : 'Proposta / Orçamento de Serviços'}</h4>
                <p className="text-center text-sm mb-6">{city}, {new Date(issueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                <p className="text-sm leading-relaxed mb-4">
                  {kind === 'Recibo' ? 'Recebi de' : 'Proponho a'} <strong>{client?.name}</strong>
                  {client?.cnpj && <> (CNPJ {client.cnpj})</>}, a importância de <strong>{formatBRL(value)}</strong>, referente a:
                </p>
                <p className="text-sm italic mb-8">{description}</p>
                <p className="text-sm">Por ser verdade, firmo o presente.</p>
                <div className="mt-12 text-center text-sm border-t border-slate-300 pt-2 w-2/3 mx-auto">
                  ConectaGov Representações
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5 mt-4">
          <DocumentUploader entityType="recibo" entityId="geral" category="Recibo" label="Anexar Recibo/Nota Recebida" />
        </Card>
      </div>
    </div>
  )
}
