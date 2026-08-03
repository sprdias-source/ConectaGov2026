import { useState } from 'react'
import { ExternalLink, Globe, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Input, Select } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import ConfirmDialog from '../ui/ConfirmDialog'
import { usePlatforms } from '../../hooks/usePlatforms'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import { mensagemDeErro } from '../../lib/errors'
import type { Platform, PlatformTipo } from '../../types/domain'

const FORM_VAZIO = {
  nome: '',
  url: '',
  tipoPadrao: 'paga' as PlatformTipo,
  valorPadrao: '',
}

// Mensagem melhor pra violação da FK client_platforms.platform_id (on
// delete restrict, de propósito — ver migração 012): o erro cru do
// Postgres cita nome de tabela/constraint que não significa nada pro
// usuário final.
function mensagemErroExclusao(err: unknown): string {
  const bruta = mensagemDeErro(err)
  if (bruta.includes('client_platforms')) {
    return 'Essa plataforma ainda tem cliente(s) vinculado(s) — desvincule ou exclua as assinaturas antes de apagar do catálogo.'
  }
  return bruta
}

// Catálogo de plataformas de licitação — independente de cliente. Cadastra
// e edita nome/site/valores aqui; vincular um cliente específico a uma
// dessas plataformas (com login, mensalidade e vencimento próprios daquele
// cliente) é feito à parte, na assinatura por cliente logo abaixo.
export default function PlatformsCatalogPanel() {
  const { platforms, isLoading, addPlatform, updatePlatform, deletePlatform } = usePlatforms()
  const { nivel } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivel === 'edicao'

  const [mostrarForm, setMostrarForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Platform | null>(null)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)

  const abrirNova = () => {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setMostrarForm(true)
  }

  const abrirEdicao = (p: Platform) => {
    setEditandoId(p.id)
    setForm({
      nome: p.nome,
      url: p.url ?? '',
      tipoPadrao: p.tipoPadrao,
      valorPadrao: p.valorPadrao != null ? String(p.valorPadrao) : '',
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
    if (!form.nome.trim()) return
    const payload = {
      nome: form.nome.trim(),
      url: form.url.trim() || null,
      tipoPadrao: form.tipoPadrao,
      valorPadrao: form.tipoPadrao === 'paga' && form.valorPadrao ? parseFloat(form.valorPadrao) : null,
    }
    try {
      if (editandoId) {
        const atual = platforms.find((p) => p.id === editandoId)
        if (!atual) return
        await updatePlatform.mutateAsync({ ...atual, ...payload })
      } else {
        await addPlatform.mutateAsync(payload)
      }
      fechar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  const handleExcluir = async () => {
    if (!excluindo) return
    setErroExclusao(null)
    try {
      await deletePlatform.mutateAsync(excluindo)
      setExcluindo(null)
    } catch (err) {
      setErroExclusao(mensagemErroExclusao(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-base-100">Catálogo de Plataformas</h3>
          <p className="text-[11px] text-base-500 mt-0.5">Cadastre uma vez, vincule a quantos clientes precisar logo abaixo</p>
        </div>
        {podeEditar && !mostrarForm && (
          <button onClick={abrirNova} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
            <Plus className="w-3.5 h-3.5" /> Nova plataforma
          </button>
        )}
      </div>

      <ErrorAlert error={addPlatform.error || updatePlatform.error} />

      {mostrarForm && podeEditar && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-accent-300 font-semibold">{editandoId ? 'Editar plataforma' : 'Nova plataforma'}</p>
            <button onClick={fechar} className="text-base-500 hover:text-base-300"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nome *</label>
              <Input placeholder="Ex: Portal de Compras Públicas" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Site</label>
              <Input placeholder="portaldecompraspublicas.com.br" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Tipo padrão</label>
              <Select value={form.tipoPadrao} onChange={(e) => setForm({ ...form, tipoPadrao: e.target.value as PlatformTipo })}>
                <option value="paga">Paga</option>
                <option value="gratuita">Gratuita</option>
              </Select>
            </div>
            {form.tipoPadrao === 'paga' && (
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Valor padrão (R$/mês)</label>
                <Input type="number" step="0.01" value={form.valorPadrao} onChange={(e) => setForm({ ...form, valorPadrao: e.target.value })} />
              </div>
            )}
          </div>
          <p className="text-[11px] text-base-500">
            Tipo e valor aqui são só o padrão sugerido — cada cliente vinculado pode ter mensalidade e vencimento próprios.
          </p>
          {erro && <p className="text-[11px] text-negative-400">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={fechar}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={!form.nome.trim() || addPlatform.isPending || updatePlatform.isPending}>
              {addPlatform.isPending || updatePlatform.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-[12px] text-base-500 italic py-2">Carregando...</p>
      ) : platforms.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-2">Nenhuma plataforma cadastrada no catálogo ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {platforms.map((p) => (
            <div key={p.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
              <Globe className="w-4 h-4 text-accent-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-base-200 truncate">{p.nome}</span>
                  {p.url && (
                    <a href={p.url.startsWith('http') ? p.url : `https://${p.url}`} target="_blank" rel="noreferrer" className="text-accent-400 hover:text-accent-300">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-base-500 mt-0.5">
                  {p.tipoPadrao === 'gratuita' ? 'Gratuita' : p.valorPadrao != null ? `Paga · R$ ${p.valorPadrao.toFixed(2)}/mês (padrão)` : 'Paga'}
                </p>
              </div>
              {podeEditar && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => abrirEdicao(p)} title="Editar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setErroExclusao(null); setExcluindo(p) }} title="Excluir" className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!excluindo}
        title="Excluir Plataforma"
        description={erroExclusao ?? `Isso remove "${excluindo?.nome}" do catálogo. Não pode ser desfeito.`}
        confirmLabel="Excluir"
        danger
        isLoading={deletePlatform.isPending}
        onCancel={() => setExcluindo(null)}
        onConfirm={handleExcluir}
      />
    </div>
  )
}
