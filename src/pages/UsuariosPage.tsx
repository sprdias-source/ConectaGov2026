import { UserCog, ShieldAlert } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { supabase } from '../lib/supabase'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import MatrizPermissoes from '../components/usuarios/MatrizPermissoes'

// Gate própria da página (além do RLS do banco): quem não é dono da conta só
// entra aqui se um dono explicitamente conceder "edição" na ferramenta
// 'usuarios' — antes, qualquer membro convidado (mesmo "sem_acesso" em tudo)
// chegava direto na Matriz de Permissões só digitando a URL, e dali
// conseguia conceder acesso total a si mesmo. Como nenhum membro pode ter
// tido permissão configurada pra uma tool_key que não existia até essa
// correção, todo mundo começa sem acesso e precisa ser liberado à mão.
export default function UsuariosPage() {
  const { nivel, carregando } = usePermissaoFerramenta('usuarios')
  const podeAcessar = nivel === 'edicao'

  return (
    <div className="pb-10">
      <PageHeader title="Usuários" subtitle="Convide membros da equipe e controle o que cada um pode ver ou editar" icon={UserCog} />

      <div className="px-6 mt-3">
        {carregando ? null : !podeAcessar ? (
          <Card className="p-5">
            <EmptyState
              icon={ShieldAlert}
              title="Acesso restrito"
              description="Você não tem permissão pra gerenciar usuários e permissões desta conta. Peça ao dono da conta pra liberar acesso à ferramenta 'Usuários' se precisar entrar aqui."
            />
          </Card>
        ) : (
          <Card className="p-5">
            <MatrizPermissoes supabase={supabase} />
          </Card>
        )}
      </div>
    </div>
  )
}
