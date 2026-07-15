import { useEffect, useState, type FormEvent } from 'react'
import { todayLocalISO } from '../../lib/dateUtils'
import { Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import Modal from '../ui/Modal'
import { Field, Input, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import { fetchCnpjData, fetchCepData, formatCnpjMask, formatCepMask } from '../../lib/publicData'
import type { Client } from '../../types/domain'

const emptyForm: Partial<Client> = {
  name: '', cnpj: '', address: '', cep: '', bairro: '', cidade: '', inscricaoEstadual: '',
  phone: '', whatsapp: '', email: '', website: '',
  bancoNome: '', bancoAgencia: '', bancoConta: '',
  responsavelNome: '', responsavelCpf: '', responsavelCargo: '',
  isMensalista: false, valorMensalidade: undefined, periodoMeses: 12, diaVencimento: 10,
  dataCadastro: todayLocalISO(),
}

export default function ClientFormModal({
  open, onClose, onSave, initial, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Client>) => void
  initial?: Client | null
  isSaving: boolean
  error?: unknown
}) {
  const [form, setForm] = useState<Partial<Client>>(initial ?? emptyForm)
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [cnpjMessage, setCnpjMessage] = useState('')
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [cepMessage, setCepMessage] = useState('')

  // CORREÇÃO DE BUG: o modal é montado uma única vez e reaberto com itens
  // diferentes (editar cliente A, depois cliente B). Sem este efeito, o
  // formulário "trava" nos dados do primeiro item editado. Sempre que o
  // modal abre, sincronizamos o formulário com o registro atual (ou com um
  // formulário vazio, se for criação).
  useEffect(() => {
    if (open) {
      setForm(initial ?? emptyForm)
      setCnpjStatus('idle')
      setCepStatus('idle')
    }
  }, [open, initial])

  const handleBuscarCnpj = async () => {
    if (!form.cnpj) return
    setCnpjStatus('loading')
    setCnpjMessage('')
    const { data, error } = await fetchCnpjData(form.cnpj)
    if (error || !data) {
      setCnpjStatus('error')
      setCnpjMessage(error ?? 'Erro desconhecido.')
      return
    }
    setForm((f) => ({
      ...f,
      name: data.razaoSocial || data.nomeFantasia || f.name,
      address: `${data.logradouro}${data.numero ? ', ' + data.numero : ''} - ${data.bairro}, ${data.municipio} - ${data.uf}`,
      // Além do endereço completo (mantido por compatibilidade com o que já
      // existia), já preenchemos bairro/cidade separados também, que são
      // exigidos pelo modelo de Proposta de Preços.
      bairro: data.bairro || f.bairro,
      cidade: data.municipio || f.cidade,
      cep: data.cep ? formatCepMask(data.cep) : f.cep,
      phone: data.telefone || f.phone,
      email: data.email || f.email,
    }))
    setCnpjStatus('success')
    setCnpjMessage('Dados preenchidos a partir da Receita Federal.')
  }

  const handleBuscarCep = async () => {
    if (!form.cep) return
    setCepStatus('loading')
    setCepMessage('')
    const { data, error } = await fetchCepData(form.cep)
    if (error || !data) {
      setCepStatus('error')
      setCepMessage(error ?? 'Erro desconhecido.')
      return
    }
    setForm((f) => ({
      ...f,
      address: `${data.logradouro} - ${data.bairro}, ${data.localidade} - ${data.uf}`,
      bairro: data.bairro || f.bairro,
      cidade: data.localidade || f.cidade,
    }))
    setCepStatus('success')
    setCepMessage('Endereço preenchido a partir do CEP.')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Cliente / Parceiro' : 'Novo Cliente / Parceiro'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="CNPJ">
          <div className="flex gap-2">
            <Input
              value={form.cnpj ?? ''}
              onChange={(e) => setForm({ ...form, cnpj: formatCnpjMask(e.target.value) })}
              placeholder="00.000.000/0001-00"
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={handleBuscarCnpj} disabled={cnpjStatus === 'loading' || !form.cnpj}>
              {cnpjStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Buscar
            </Button>
          </div>
          {cnpjStatus === 'success' && (
            <p className="text-[11px] text-positive-400 flex items-center gap-1 mt-1"><CheckCircle2 className="w-3 h-3" /> {cnpjMessage}</p>
          )}
          {cnpjStatus === 'error' && (
            <p className="text-[11px] text-negative-400 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" /> {cnpjMessage}</p>
          )}
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
          <Field label="Nome / Razão Social" required>
            <Input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Construtora Vale do Sol Ltda" />
          </Field>
          <Field label="Inscrição Estadual">
            <Input value={form.inscricaoEstadual ?? ''} onChange={(e) => setForm({ ...form, inscricaoEstadual: e.target.value })} placeholder="Se houver" />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
          <Field label="CEP">
            <div className="flex gap-2">
              <Input
                value={form.cep ?? ''}
                onChange={(e) => setForm({ ...form, cep: formatCepMask(e.target.value) })}
                placeholder="00000-000"
              />
              <Button type="button" variant="secondary" onClick={handleBuscarCep} disabled={cepStatus === 'loading' || !form.cep}>
                {cepStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </Field>
          <Field label="Endereço">
            <Input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número - Bairro, Cidade - UF" />
          </Field>
        </div>
        {cepStatus === 'success' && (
          <p className="text-[11px] text-positive-400 flex items-center gap-1 -mt-2"><CheckCircle2 className="w-3 h-3" /> {cepMessage}</p>
        )}
        {cepStatus === 'error' && (
          <p className="text-[11px] text-negative-400 flex items-center gap-1 -mt-2"><AlertCircle className="w-3 h-3" /> {cepMessage}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Bairro">
            <Input value={form.bairro ?? ''} onChange={(e) => setForm({ ...form, bairro: e.target.value })} placeholder="Preenchido junto com CNPJ/CEP, mas pode ajustar" />
          </Field>
          <Field label="Cidade">
            <Input value={form.cidade ?? ''} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Preenchido junto com CNPJ/CEP, mas pode ajustar" />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Telefone">
            <Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 0000-0000" />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp ?? ''} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com.br" />
          </Field>
        </div>

        <Field label="Website">
          <Input value={form.website ?? ''} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="www.empresa.com.br" />
        </Field>

        <div className="border-t border-base-800 pt-4">
          <p className="text-[12px] font-bold text-base-300 mb-3">Dados para Propostas de Preços</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Field label="Banco">
              <Input value={form.bancoNome ?? ''} onChange={(e) => setForm({ ...form, bancoNome: e.target.value })} placeholder="Ex: 756 - Sicoob" />
            </Field>
            <Field label="Agência">
              <Input value={form.bancoAgencia ?? ''} onChange={(e) => setForm({ ...form, bancoAgencia: e.target.value })} placeholder="0000" />
            </Field>
            <Field label="Conta Corrente">
              <Input value={form.bancoConta ?? ''} onChange={(e) => setForm({ ...form, bancoConta: e.target.value })} placeholder="00000-0" />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Responsável Legal">
              <Input value={form.responsavelNome ?? ''} onChange={(e) => setForm({ ...form, responsavelNome: e.target.value })} placeholder="Nome completo" />
            </Field>
            <Field label="CPF do Responsável">
              <Input value={form.responsavelCpf ?? ''} onChange={(e) => setForm({ ...form, responsavelCpf: e.target.value })} placeholder="000.000.000-00" />
            </Field>
            <Field label="Cargo do Responsável">
              <Input value={form.responsavelCargo ?? ''} onChange={(e) => setForm({ ...form, responsavelCargo: e.target.value })} placeholder="Ex: Sócio Administrador" />
            </Field>
          </div>
        </div>

        <Field label="Data de Cadastro">
          <Input type="date" value={form.dataCadastro ?? ''} onChange={(e) => setForm({ ...form, dataCadastro: e.target.value })} />
        </Field>

        <div className="border-t border-base-800 pt-4">
          <label className="flex items-center gap-2.5 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={form.isMensalista ?? false}
              onChange={(e) => setForm({ ...form, isMensalista: e.target.checked })}
              className="w-4 h-4 rounded accent-accent-500"
            />
            <span className="text-sm font-semibold text-base-200">Cliente Mensalista (gera cobranças recorrentes)</span>
          </label>

          {form.isMensalista && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-base-850/60 border border-base-700/50 rounded-lg p-4">
              <Field label="Valor Mensalidade (R$)" required>
                <CurrencyInput value={form.valorMensalidade ?? 0} onChange={(v) => setForm({ ...form, valorMensalidade: v })} />
              </Field>
              <Field label="Período (meses)" required>
                <Input type="number" required value={form.periodoMeses ?? 12} onChange={(e) => setForm({ ...form, periodoMeses: parseInt(e.target.value) || 12 })} />
              </Field>
              <Field label="Dia de Vencimento" required>
                <Input type="number" min={1} max={28} required value={form.diaVencimento ?? 10} onChange={(e) => setForm({ ...form, diaVencimento: parseInt(e.target.value) || 10 })} />
              </Field>
              <Field label="Início do Contrato">
                <Input type="date" value={form.dataInicioContrato ?? ''} onChange={(e) => setForm({ ...form, dataInicioContrato: e.target.value })} />
              </Field>
              <Field label="Início do Pagamento">
                <Input type="date" value={form.dataInicioPagamento ?? ''} onChange={(e) => setForm({ ...form, dataInicioPagamento: e.target.value })} />
              </Field>
            </div>
          )}
        </div>

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Cliente'}</Button>
        </div>
      </form>
    </Modal>
  )
}
