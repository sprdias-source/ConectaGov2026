import { useState } from 'react'
import { CircleDot, Globe, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Input, Select } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import CampoSenha from '../auth/CampoSenha'
import { usePlatforms } from '../../hooks/usePlatforms'
import { useClientPlatforms, calcPlatformStatus, diasParaVencer } from '../../hooks/useClientPlatforms'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import { mensagemDeErro } from '../../lib/errors'
import type { ClientPlatform, PlatformStatus, PlatformTipo } from '../../types/domain'

function StatusBadge({ status }: { status: PlatformStatus }) {
  const map: Record<PlatformStatus, string> = {
    ativa: 'bg-positive-500/15 text-positive-400 border-positive-500/30',
    vencendo: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
    vencida: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
    sem_vencimento: 'bg-base-700/40 text-base-400 border-base-700',
  }
  const labels: Record<PlatformStatus, string> = {
    ativa: 'Ativa', vencendo: 'Vencendo', vencida: 'Vencida', sem_vencimento: 'Sem vencimento',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${map[status]}`}>
      {labels[status]}
    </span>
  )
}

const FORM_VAZIO = {
  platformId: '',
  tipo: 'paga' as PlatformTipo,
  valorMensalidade: '',
  dataVencimento: '',
  diasAvisoVencimento: '15',
  login: '',
  senha: '',
  observacoes: '',
  ativo: true,
}

interface Props {
  clientId: string
  clientName: string
}

export default function ClientPlatformsPanel({ clientId, clientName }: Props) {
  const { platforms } = usePlatforms()
  const { clientPlatforms, addClientPlatform, updateClientPlatform, deleteClientPlatform } = useClientPlatforms(clientId)
  const { nivel: nivelCadastros, carregando: carregandoPermissao } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivelCadastros === 'edicao' && !carregandoPermissao

  const [mostrarForm, setMostrarForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erro, setErro] = useState<string | null>(null)

  const nomePlataforma = (platformId: string) => platforms.find((p) => p.id === platformId)?.nome ?? 'Plataforma removida'

  const abrirNovo = () => {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMostrarForm(true)
  }

  const abrirEdicao = (cp: ClientPlatform) => {
    setEditandoId(cp.id)
    setForm({
      platformId: cp.platformId,
      tipo: cp.tipo,
      valorMensalidade: cp.valorMensalidade != null ? String(cp.valorMensalidade) : '',
      dataVencimento: cp.dataVencimento ?? '',
      diasAvisoVencimento: String(cp.diasAvisoVencimento),
      login: cp.login ?? '',
      senha: cp.senha ?? '',
      observacoes: cp.observacoes ?? '',
      ativo: cp.ativo,
    })
    setMostrarForm(true)
  }

  const fechar = () => {
    setMostrarForm(false)
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErro(null)
  }

  const handleSalvar = async () => {
    setErro(null)
    if (!form.platformId) return
    try {
      const payload = {
        platformId: form.platformId,
        tipo: form.tipo,
        valorMensalidade: form.tipo === 'paga' && form.valorMensalidade ? parseFloat(form.valorMensalidade) : null,
        dataVencimento: form.dataVencimento || null,
        diasAvisoVencimento: form.diasAvisoVencimento ? parseInt(form.diasAvisoVencimento, 10) : 15,
        login: form.login.trim() || null,
        senha: form.senha || null,
        observacoes: form.observacoes.trim() || null,
        ativo: form.ativo,
      }

      if (editandoId) {
        const atual = clientPlatforms.find((cp) => cp.id === editandoId)
        if (!atual) return
        await updateClientPlatform.mutateAsync({ ...atual, ...payload })
      } else {
        await addClientPlatform.mutateAsync(payload)
      }
      fechar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  const salvando = addClientPlatform.isPending || updateClientPlatform.isPending

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-base-100">Plataformas — {clientName}</h3>
          <p className="text-[11px] text-base-500 mt-0.5">Assinaturas em portais de licitação, pagos e gratuitos</p>
        </div>
        {podeEditar && !mostrarForm && (
          <button
            onClick={abrirNovo}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Nova assinatura
          </button>
        )}
      </div>

      <ErrorAlert error={addClientPlatform.error || updateClientPlatform.error || deleteClientPlatform.error} />

      {mostrarForm && podeEditar && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-accent-300 font-semibold">
              {editandoId ? 'Editar assinatura' : 'Nova assinatura'}
            </p>
            <button onClick={fechar} className="text-base-500 hover:text-base-300"><X className="w-3.5 h-3.5" /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Plataforma *</label>
              <Select
                value={form.platformId}
                onChange={(e) => {
                  const platformId = e.target.value
                  const cfg = platforms.find((p) => p.id === platformId)
                  setForm({
                    ...form,
                    platformId,
                    tipo: cfg?.tipoPadrao ?? form.tipo,
                    valorMensalidade: cfg?.valorPadrao != null ? String(cfg.valorPadrao) : form.valorMensalidade,
                  })
                }}
              >
                <option value="">— Selecione —</option>
                {platforms.filter((p) => p.ativo || p.id === form.platformId).map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}{!p.ativo ? ' (inativa)' : ''}</option>
                ))}
              </Select>
              {platforms.length === 0 && (
                <p className="text-[11px] text-base-500 italic mt-1">Nenhuma plataforma no catálogo ainda — cadastre uma no Catálogo de Plataformas acima antes de vincular.</p>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Tipo</label>
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as PlatformTipo })}>
                <option value="paga">Paga</option>
                <option value="gratuita">Gratuita</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {form.tipo === 'paga' && (
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Mensalidade (R$)</label>
                <Input type="number" step="0.01" value={form.valorMensalidade} onChange={(e) => setForm({ ...form, valorMensalidade: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Vencimento</label>
              <Input type="date" value={form.dataVencimento} onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })} />
            </div>
            <div className="relative">
              <label className="text-[10px] uppercase tracking-wider text-accent-400 font-bold block mb-1">Avisar com quantos dias de antecedência</label>
              <Input type="number" min="0" value={form.diasAvisoVencimento} onChange={(e) => setForm({ ...form, diasAvisoVencimento: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Login de acesso</label>
              <Input placeholder="usuário, e-mail ou CNPJ" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Senha</label>
              <CampoSenha value={form.senha} onChange={(v) => setForm({ ...form, senha: v })} placeholder="Senha de acesso" autoComplete="off" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Observações</label>
            <Input placeholder="Opcional" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>

          {editandoId && (
            <label className="flex items-center gap-2 text-[12px] text-base-300 cursor-pointer w-fit">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="accent-accent-500" />
              Assinatura ativa (desmarque se o cliente parou de usar esta plataforma, sem apagar o histórico)
            </label>
          )}

          {erro && <p className="text-[11px] text-negative-400">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={fechar}>Cancelar</Button>
            <Button
              onClick={handleSalvar}
              disabled={salvando || !form.platformId}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {clientPlatforms.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-2">Nenhuma plataforma cadastrada ainda para este cliente.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {clientPlatforms.map((cp) => {
            const status = calcPlatformStatus(cp.dataVencimento, cp.diasAvisoVencimento)
            const dias = diasParaVencer(cp.dataVencimento)
            return (
              <div key={cp.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
                <Globe className="w-4 h-4 text-accent-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-base-200 truncate">{nomePlataforma(cp.platformId)}</span>
                    {!cp.ativo && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-base-700/40 text-base-400 border-base-700">Inativa</span>
                    )}
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-[11px] text-base-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {cp.tipo === 'gratuita' ? (
                      <span>Gratuita</span>
                    ) : (
                      <span>{cp.valorMensalidade != null ? `R$ ${cp.valorMensalidade.toFixed(2)}/mês` : 'Paga'}</span>
                    )}
                    {cp.dataVencimento && (
                      <span className="flex items-center gap-1">
                        <CircleDot className="w-2.5 h-2.5" />
                        vence {new Date(cp.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                        {dias !== null && (dias < 0 ? ` (há ${Math.abs(dias)} dias)` : ` (em ${dias} dias)`)}
                        {' · aviso '}{cp.diasAvisoVencimento}d antes
                      </span>
                    )}
                  </p>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => abrirEdicao(cp)} title="Editar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteClientPlatform.mutate(cp)} title="Remover" className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
