import { useState } from 'react'
import { ShieldCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { useSchemaHealthCheck } from '../hooks/useSchemaHealthCheck'
import { useAuditLog } from '../hooks/useAuditLog'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { useQueryClient } from '@tanstack/react-query'

// Log de auditoria geral da conta — os eventos (logEvent, useAuditLog.ts)
// já eram gravados desde sempre, só não existia nenhuma tela que os
// mostrasse. Mostra os 200 mais recentes (mesmo limite já usado na query),
// com filtro por texto — quem quiser o histórico de UMA licitação
// específica encontra na aba "Histórico" dela (mais completo, sem esse
// limite de 200).
function LogAuditoria() {
  const { logs, isLoading } = useAuditLog()
  const [filtro, setFiltro] = useState('')

  const filtrados = filtro.trim()
    ? logs.filter((l) => `${l.action} ${l.details ?? ''}`.toLowerCase().includes(filtro.trim().toLowerCase()))
    : logs

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-base-100">Log de Auditoria</h3>
          <p className="text-[12px] text-base-500">Últimos {logs.length} eventos registrados na conta — licitações, financeiro, clientes e mais.</p>
        </div>
        <input
          type="text"
          placeholder="Filtrar por texto..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="bg-base-900 border border-base-700 rounded-lg px-3 py-1.5 text-[12px] text-base-100 focus:border-accent-400 outline-none w-56"
        />
      </div>
      {isLoading ? (
        <p className="text-[12px] text-base-500 italic py-4">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-4">Nenhum evento encontrado.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[480px] overflow-y-auto">
          {filtrados.map((log) => (
            <div key={log.id} className="flex items-start justify-between gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-base-200">{log.action}</p>
                {log.details && <p className="text-[11px] text-base-400 mt-0.5">{log.details}</p>}
              </div>
              <p className="text-[10px] text-base-500 font-mono whitespace-nowrap shrink-0">
                {new Date(log.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function DiagnosticoPage() {
  const { data, isLoading, isFetching } = useSchemaHealthCheck()
  const queryClient = useQueryClient()
  // Mesma ferramenta 'usuarios' usada em /usuarios — essa tela expõe o log
  // de auditoria da conta inteira (quem fez o quê), então trata como área
  // de governança, não algo que qualquer membro convidado deva ver.
  const { nivel, carregando } = usePermissaoFerramenta('usuarios')
  const podeAcessar = nivel === 'edicao'

  const recheck = () => queryClient.invalidateQueries({ queryKey: ['schema_health_check'] })

  if (carregando) return null

  if (!podeAcessar) {
    return (
      <div className="pb-10">
        <PageHeader title="Diagnóstico do Sistema" icon={ShieldCheck} />
        <div className="px-6 mt-3">
          <Card className="p-5">
            <EmptyState
              icon={ShieldAlert}
              title="Acesso restrito"
              description="Você não tem permissão pra ver o diagnóstico e o log de auditoria desta conta. Peça ao dono da conta pra liberar acesso à ferramenta 'Usuários' se precisar entrar aqui."
            />
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Diagnóstico do Sistema"
        subtitle="Verifica se o banco de dados está com a estrutura mais recente esperada pelo aplicativo"
        icon={ShieldCheck}
        actions={
          <button
            onClick={recheck}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Verificar novamente
          </button>
        }
      />

      <div className="px-6 mt-4">
        {isLoading ? (
          <Card className="p-8 text-center text-base-500 text-sm">Verificando estrutura do banco de dados...</Card>
        ) : data?.ok ? (
          <Card className="p-6 border-positive-500/30 bg-positive-500/5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-positive-400" />
              <div>
                <p className="font-bold text-positive-400">Tudo certo!</p>
                <p className="text-[13px] text-base-400">O banco de dados está com toda a estrutura necessária. As automações devem funcionar normalmente.</p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 border-negative-500/30 bg-negative-500/5">
            <div className="flex items-start gap-3 mb-4">
              <ShieldAlert className="w-8 h-8 text-negative-400 shrink-0" />
              <div>
                <p className="font-bold text-negative-400">Estrutura do banco incompleta</p>
                <p className="text-[13px] text-base-400">
                  As seguintes áreas estão faltando colunas/tabelas no banco de dados. Isso explica por que as automações relacionadas não estão funcionando — o código está pronto, mas o banco ainda não foi atualizado para suportá-lo.
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-2 mb-4">
              {data?.missingColumns.map((item) => (
                <li key={item} className="flex items-center gap-2 bg-base-850/60 rounded-lg px-3 py-2 text-[13px] text-base-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-negative-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="bg-base-850/60 border border-base-700/50 rounded-lg p-4 text-[13px] text-base-300">
              <p className="font-semibold text-base-200 mb-1.5">Como corrigir:</p>
              <p className="text-base-400">
                Cada item acima corresponde a uma migration SQL específica do projeto (pasta{' '}
                <code className="bg-base-800 px-1.5 py-0.5 rounded text-accent-300">supabase/migrations/</code>).
                Verifique qual migration cria a tabela/coluna faltante e execute ela no{' '}
                <strong className="text-base-200">SQL Editor</strong> do Supabase (Dashboard do projeto).
                Depois, clique em "Verificar novamente" acima para confirmar.
              </p>
            </div>
          </Card>
        )}
      </div>

      <div className="px-6 mt-4">
        <LogAuditoria />
      </div>
    </div>
  )
}
