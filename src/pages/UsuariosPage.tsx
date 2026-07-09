import { UserCog } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { supabase } from '../lib/supabase'
import MatrizPermissoes from '../components/usuarios/MatrizPermissoes'

export default function UsuariosPage() {
  return (
    <div className="pb-10">
      <PageHeader title="Usuários" subtitle="Convide membros da equipe e controle o que cada um pode ver ou editar" icon={UserCog} />

      <div className="px-6 mt-3">
        <Card className="p-5">
          <MatrizPermissoes supabase={supabase} />
        </Card>
      </div>
    </div>
  )
}
