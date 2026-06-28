import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // CORREÇÃO DE BUG CRÍTICO: o Supabase dispara este evento sempre que
      // a aba volta a ficar visível/em foco (TOKEN_REFRESHED), mesmo sem
      // nenhuma mudança real de sessão. Sem esta guarda, cada volta à aba
      // gerava um objeto de sessão novo, que recriava o contexto inteiro,
      // que re-renderizava toda a árvore de componentes — percebido pelo
      // usuário como "o sistema trava ao voltar para a página".
      setSession((prev) => {
        if (prev?.access_token === newSession?.access_token && prev?.user?.id === newSession?.user?.id) {
          return prev
        }
        return newSession
      })
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: translateAuthError(error.message) }
    return { error: null }
  }

  const signUp: AuthContextValue['signUp'] = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) return { error: translateAuthError(error.message) }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const user = session?.user ?? null

  // CORREÇÃO DE BUG CRÍTICO: sem useMemo, este objeto era um literal NOVO
  // em toda renderização do AuthProvider — isso forçava todo componente
  // que usa useAuth() (praticamente o app inteiro) a re-renderizar sempre,
  // mesmo quando nada de fato mudou. Memoizamos por id do usuário e
  // loading, que são os únicos valores que realmente importam para quem
  // consome o contexto.
  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signIn, signUp, signOut }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, session?.access_token, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'User already registered': 'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
  }
  return map[message] ?? message
}
