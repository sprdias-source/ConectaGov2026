import { useState, useMemo, useEffect } from 'react'
import { todayLocalISO } from '../../lib/dateUtils'
import { Search, Plus, Pencil, Trash2, Globe, Phone, MessageCircle, Users, EyeOff, Eye, Power } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState } from '../ui/Primitives'
import ClientFormModal from './ClientFormModal'
import DeleteWithPasswordDialog from '../ui/DeleteWithPasswordDialog'
import ErrorAlert from '../ui/ErrorAlert'
import { useClients } from '../../hooks/useClients'
import type { Client } from '../../types/domain'

type FilterMode = 'todos' | 'mensalistas' | 'individuais'

export default function ClientsTab() {
  const { clients, isLoading, addClient, updateClient, deleteClient, toggleClientActive, checkClientHasFinancialHistory } = useClients()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('todos')
  const [showInactive, setShowInactive] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)
  const [financialWarning, setFinancialWarning] = useState<string | undefined>()

  useEffect(() => {
    if (!deleting) {
      setFinancialWarning(undefined)
      return
    }
    checkClientHasFinancialHistory(deleting.id).then((hasHistory) => {
      setFinancialWarning(
        hasHistory
          ? 'Este cliente possui transações financeiras já pagas — todo esse histórico será perdido junto.'
          : undefined
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting?.id])

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (!showInactive && !c.isActive) return false
      if (filter === 'mensalistas' && !c.isMensalista) return false
      if (filter === 'individuais' && c.isMensalista) return false
      if (search) {
        const q = search.toLowerCase()
        return c.name.toLowerCase().includes(q) || (c.cnpj ?? '').includes(q)
      }
      return true
    })
  }, [clients, filter, search, showInactive])

  const handleSave = (data: Partial<Client>) => {
    if (editing) {
      updateClient.mutate({ ...editing, ...data } as Client, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addClient.mutate(data, { onSuccess: () => setModalOpen(false) })
    }
  }

  const exportCsv = () => {
    const header = ['Nome', 'CNPJ', 'Endereço', 'Telefone', 'WhatsApp', 'E-mail', 'Website', 'Mensalista', 'Valor Mensalidade', 'Status']
    const rows = filtered.map((c) => [
      c.name, c.cnpj ?? '', c.address ?? '', c.phone ?? '', c.whatsapp ?? '', c.email ?? '', c.website ?? '',
      c.isMensalista ? 'Sim' : 'Não', c.valorMensalidade?.toString() ?? '', c.isActive ? 'Ativo' : 'Inativo',
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes-${todayLocalISO()}.csv`
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

      <div className="flex justify-between items-center mb-2">
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`text-[12px] font-semibold flex items-center gap-1.5 transition ${showInactive ? 'text-accent-300' : 'text-base-500 hover:text-base-300'}`}
        >
          {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showInactive ? 'Mostrando inativos' : 'Mostrar inativos'}
        </button>
        <button onClick={exportCsv} className="text-[12px] font-semibold text-positive-400 hover:text-positive-300 flex items-center gap-1.5">
          Exportar CSV
        </button>
      </div>

      <ErrorAlert error={deleteClient.error || toggleClientActive.error} />

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
                  <tr key={c.id} className={`border-b border-base-800/60 hover:bg-base-850/40 transition ${!c.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-base-100 flex items-center gap-2">
                        {c.name}
                        {!c.isActive && (
                          <span className="px-1.5 py-0.5 rounded bg-base-700 text-base-400 text-[10px] font-bold">Inativo</span>
                        )}
                      </div>
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
                        <button
                          onClick={() => toggleClientActive.mutate({ client: c, isActive: !c.isActive })}
                          title={c.isActive ? 'Inativar cliente (preserva histórico)' : 'Reativar cliente'}
                          className={`p-1.5 rounded transition hover:bg-base-800 ${c.isActive ? 'text-base-400 hover:text-warning-400' : 'text-positive-400 hover:text-positive-300'}`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
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
        error={addClient.error || updateClient.error}
      />

      <DeleteWithPasswordDialog
        open={!!deleting}
        title="Excluir Cliente Definitivamente"
        entityLabel={`O cliente "${deleting?.name}"`}
        financialWarning={financialWarning}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteClient.mutate(deleting, { onSuccess: () => setDeleting(null) })
        }}
        isLoading={deleteClient.isPending}
        error={deleteClient.error}
      />
    </div>
  )
}
