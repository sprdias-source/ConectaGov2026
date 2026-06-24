import { useState, useMemo } from 'react'
import { Search, Plus, Pencil, Trash2, Globe, Phone, MessageCircle, Users } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState } from '../ui/Primitives'
import ClientFormModal from './ClientFormModal'
import ConfirmDialog from '../ui/ConfirmDialog'
import { useClients } from '../../hooks/useClients'
import type { Client } from '../../types/domain'

type FilterMode = 'todos' | 'mensalistas' | 'individuais'

export default function ClientsTab() {
  const { clients, isLoading, addClient, updateClient, deleteClient } = useClients()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (filter === 'mensalistas' && !c.isMensalista) return false
      if (filter === 'individuais' && c.isMensalista) return false
      if (search) {
        const q = search.toLowerCase()
        return c.name.toLowerCase().includes(q) || (c.cnpj ?? '').includes(q)
      }
      return true
    })
  }, [clients, filter, search])

  const handleSave = (data: Partial<Client>) => {
    if (editing) {
      updateClient.mutate({ ...editing, ...data } as Client, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addClient.mutate(data, { onSuccess: () => setModalOpen(false) })
    }
  }

  const exportCsv = () => {
    const header = ['Nome', 'CNPJ', 'Endereço', 'Telefone', 'WhatsApp', 'E-mail', 'Website', 'Mensalista', 'Valor Mensalidade']
    const rows = filtered.map((c) => [
      c.name, c.cnpj ?? '', c.address ?? '', c.phone ?? '', c.whatsapp ?? '', c.email ?? '', c.website ?? '',
      c.isMensalista ? 'Sim' : 'Não', c.valorMensalidade?.toString() ?? '',
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-base-100">Diretório Oficial de Parcerias</h2>
          <p className="text-base-400 text-[13px]">Cadastro estruturado de empresas das áreas de licitações parceiras.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-base-850 border border-base-700 rounded-lg p-0.5 text-[12px] font-semibold">
            {(['todos', 'mensalistas', 'individuais'] as FilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`px-3 py-1.5 rounded-md transition capitalize ${filter === m ? 'bg-base-700 text-accent-300' : 'text-base-400 hover:text-base-200'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome ou CNPJ..."
              className="bg-base-850 border border-base-700 rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-base-100 placeholder:text-base-500 outline-none focus:border-accent-400 w-56"
            />
          </div>
          <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus className="w-4 h-4" /> Novo Cliente
          </Button>
        </div>
      </div>

      <div className="flex justify-end mb-2">
        <button onClick={exportCsv} className="text-[12px] font-semibold text-positive-400 hover:text-positive-300 flex items-center gap-1.5">
          Exportar CSV
        </button>
      </div>

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando clientes...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Cadastre seu primeiro cliente ou ajuste os filtros de busca." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Nome / Razão Social</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">CNPJ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Endereço</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Contatos</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Email/Site</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-base-100">{c.name}</div>
                      {c.isMensalista && (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-accent-500/15 text-accent-300 text-[10px] font-bold">
                          Mensalista (R$ {c.valorMensalidade?.toLocaleString('pt-BR')})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-base-300 font-mono text-[12px]">{c.cnpj || '—'}</td>
                    <td className="px-4 py-3 text-base-400 text-[13px] max-w-[200px] truncate">{c.address || '—'}</td>
                    <td className="px-4 py-3 text-[12px]">
                      {c.phone && <div className="flex items-center gap-1.5 text-base-300"><Phone className="w-3 h-3" />{c.phone}</div>}
                      {c.whatsapp && <div className="flex items-center gap-1.5 text-positive-400 mt-0.5"><MessageCircle className="w-3 h-3" />{c.whatsapp}</div>}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {c.email && <div className="text-base-300 truncate max-w-[160px]">{c.email}</div>}
                      {c.website && <div className="flex items-center gap-1 text-accent-400 mt-0.5"><Globe className="w-3 h-3" />{c.website}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(c); setModalOpen(true) }} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleting(c)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ClientFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        initial={editing}
        isSaving={addClient.isPending || updateClient.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir cliente?"
        description={`Isso vai remover "${deleting?.name}" e TODAS as licitações, empenhos e lançamentos financeiros vinculados a ele. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir definitivamente"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteClient.mutate(deleting, { onSuccess: () => setDeleting(null) })
        }}
        isLoading={deleteClient.isPending}
      />
    </div>
  )
}
