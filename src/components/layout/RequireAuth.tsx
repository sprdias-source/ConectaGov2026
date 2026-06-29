import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import LoginPage from '../../pages/auth/LoginPage'
import UpdatePasswordPage from '../../pages/auth/UpdatePasswordPage'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, isPasswordRecovery, clearPasswordRecovery } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-base-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
      </div>
    )
  }

  // Prioridade máxima: se o usuário chegou aqui através do link de "esqueci
  // minha senha", mostramos a tela de definir nova senha antes de qualquer
  // outra coisa — mesmo que a sessão temporária já esteja tecnicamente
  // autenticada, abrir o sistema normal nesse momento seria confuso.
  if (isPasswordRecovery) {
    return <UpdatePasswordPage onDone={clearPasswordRecovery} />
  }

  if (!user) {
    return <LoginPage />
  }

  return <>{children}</>
}
