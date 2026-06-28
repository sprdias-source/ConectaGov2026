import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import LoginPage from '../../pages/auth/LoginPage'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-base-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <>{children}</>
}
