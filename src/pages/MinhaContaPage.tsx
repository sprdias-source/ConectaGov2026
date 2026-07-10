import { UserCircle } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
import MinhaContaSettings from '../components/auth/MinhaContaSettings'

export default function MinhaContaPage() {
  return (
    <div className="pb-10">
      <PageHeader title="Minha Conta" subtitle="Troque seu e-mail ou senha de acesso" icon={UserCircle} />

      <div className="px-6 mt-3">
        <MinhaContaSettings />
      </div>
    </div>
  )
}
