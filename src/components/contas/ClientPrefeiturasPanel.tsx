import { useState } from 'react'
import { Globe, ExternalLink, Save, Check, Trash2, Plus } from 'lucide-react'
import { Button, Input } from '../ui/FormControls'
import { useClientPrefeituras } from '../../hooks/useClientPrefeituras'
import type { ClientPrefeitura } from '../../types/domain'

const abrirPortal = (url: string) => {
  const v = url.trim()
  if (!v) return
  window.open(/^https?:\/\//i.test(v) ? v : `https://${v}`, '_blank', 'noopener,noreferrer')
}

function PrefeituraRow({
  p, podeEditar, onSave, onDelete, saving, deleting,
}: {
  p: ClientPrefeitura
  podeEditar: boolean
  onSave: (id: string, prefeitura: string, portalUrl: string | null) => void
  onDelete: (id: string) => void
  saving: boolean
  deleting: boolean
}) {
  const [prefeitura, setPrefeitura] = useState(p.prefeitura)
  const [portalUrl, setPortalUrl] = useState(p.portalUrl ?? '')
  const [salvo, setSalvo] = useState(false)
  const sujo = prefeitura !== p.prefeitura || portalUrl !== (p.portalUrl ?? '')

  const handleSave = () => {
    onSave(p.id, prefeitura.trim(), portalUrl.trim() || null)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 1800)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={prefeitura}
        onChange={(e) => setPrefeitura(e.target.value)}
        placeholder="Nome da prefeitura"
        className="w-52"
        disabled={!podeEditar}
      />
      <Input
        value={portalUrl}
        onChange={(e) => setPortalUrl(e.target.value)}
        placeholder="https://transparencia.prefeitura.../empenhos"
        className="flex-1 min-w-[220px] font-mono text-[12.5px]"
        disabled={!podeEditar}
      />
      {podeEditar && (
        <Button
          variant="secondary"
          onClick={handleSave}
          disabled={!sujo || !prefeitura.trim() || saving}
        >
          {salvo ? <Check className="w-3.5 h-3.5 text-positive-400" /> : <Save className="w-3.5 h-3.5" />}
          {salvo ? 'Salvo' : 'Salvar'}
        </Button>
      )}
      <Button variant="secondary" onClick={() => abrirPortal(portalUrl)} disabled={!portalUrl.trim()}>
        <ExternalLink className="w-3.5 h-3.5" /> Abrir
      </Button>
      {podeEditar && (
        <Button variant="ghost" onClick={() => onDelete(p.id)} disabled={deleting} className="text-negative-400 hover:text-negative-300">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  )
}

function NovaLinhaRow({
  podeEditar, onSave, onCancel, saving,
}: {
  podeEditar: boolean
  onSave: (prefeitura: string, portalUrl: string | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const [prefeitura, setPrefeitura] = useState('')
  const [portalUrl, setPortalUrl] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={prefeitura}
        onChange={(e) => setPrefeitura(e.target.value)}
        placeholder="Nome da prefeitura"
        className="w-52"
        autoFocus
        disabled={!podeEditar}
      />
      <Input
        value={portalUrl}
        onChange={(e) => setPortalUrl(e.target.value)}
        placeholder="https://transparencia.prefeitura.../empenhos"
        className="flex-1 min-w-[220px] font-mono text-[12.5px]"
        disabled={!podeEditar}
      />
      <Button
        variant="secondary"
        onClick={() => onSave(prefeitura.trim(), portalUrl.trim() || null)}
        disabled={!prefeitura.trim() || saving}
      >
        <Save className="w-3.5 h-3.5" /> Salvar
      </Button>
      <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
    </div>
  )
}

export default function ClientPrefeiturasPanel({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const { prefeituras, addPrefeitura, updatePrefeitura, deletePrefeitura } = useClientPrefeituras()
  const [novasLinhas, setNovasLinhas] = useState<number[]>([])

  const doCliente = prefeituras.filter((p) => p.clientId === clientId)

  const handleDelete = (id: string) => {
    if (!window.confirm('Remover esta prefeitura da lista de consulta?')) return
    deletePrefeitura.mutate(id)
  }

  return (
    <div className="bg-base-900/60 border border-base-700/50 rounded-xl p-4 mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-base-400">
          <Globe className="w-3.5 h-3.5 text-accent-400" />
          Prefeituras deste cliente — portais de consulta
        </div>
        {podeEditar && (
          <Button variant="ghost" onClick={() => setNovasLinhas((v) => [...v, Date.now()])}>
            <Plus className="w-3.5 h-3.5" /> Adicionar prefeitura
          </Button>
        )}
      </div>

      {doCliente.length === 0 && novasLinhas.length === 0 && (
        <p className="text-[13px] text-base-500">Nenhuma prefeitura cadastrada pra este cliente ainda.</p>
      )}

      {doCliente.map((p) => (
        <PrefeituraRow
          key={p.id}
          p={p}
          podeEditar={podeEditar}
          onSave={(id, prefeitura, portalUrl) => updatePrefeitura.mutate({ id, prefeitura, portalUrl })}
          onDelete={handleDelete}
          saving={updatePrefeitura.isPending}
          deleting={deletePrefeitura.isPending}
        />
      ))}

      {novasLinhas.map((tempId) => (
        <NovaLinhaRow
          key={tempId}
          podeEditar={podeEditar}
          saving={addPrefeitura.isPending}
          onCancel={() => setNovasLinhas((v) => v.filter((id) => id !== tempId))}
          onSave={(prefeitura, portalUrl) => {
            addPrefeitura.mutate({ clientId, prefeitura, portalUrl }, {
              onSuccess: () => setNovasLinhas((v) => v.filter((id) => id !== tempId)),
            })
          }}
        />
      ))}

      <p className="text-[11px] text-base-500">
        Cada prefeitura fica salva com seu próprio link — útil quando um cliente tem empenhos em vários municípios.
      </p>
    </div>
  )
}
