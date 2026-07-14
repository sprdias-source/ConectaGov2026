import { ShieldCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { useSchemaHealthCheck } from '../hooks/useSchemaHealthCheck'
import { useQueryClient } from '@tanstack/react-query'

export default function DiagnosticoPage() {
  const { data, isLoading, isFetching } = useSchemaHealthCheck()
  const queryClient = useQueryClient()

  const recheck = () => queryClient.invalidateQueries({ queryKey: ['schema_health_check'] })

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
    </div>
  )
}
