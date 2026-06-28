import { useState, type FormEvent } from 'react'
import { ShieldCheck, Mail, Lock, User, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      if (error) setError(error)
    } else {
      const { error } = await signUp(email, password, fullName)
      if (error) setError(error)
      else setInfo('Conta criada. Verifique seu e-mail para confirmar o acesso, se solicitado.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-base-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Atmosfera de fundo: malha sutil de linhas, remete a "rede de editais monitorados" */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute top-[-10%] left-[15%] w-[500px] h-[500px] bg-accent-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-15%] right-[10%] w-[480px] h-[480px] bg-positive-500/5 rounded-full blur-[120px]" />

      <div className="relative w-full max-w-[420px] animate-rise">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-400 flex items-center justify-center shadow-lg shadow-accent-500/20 mb-4">
            <ShieldCheck className="w-7 h-7 text-base-950" strokeWidth={2.4} />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-base-100 tracking-tight">ConectaGov</h1>
          <p className="text-base-400 text-sm mt-1 font-mono uppercase tracking-widest text-[11px]">
            Gestão de Licitações &amp; Financeiro
          </p>
        </div>

        <div className="bg-base-900 border border-base-700/60 rounded-2xl p-7 shadow-2xl shadow-black/40">
          <div className="flex gap-1 bg-base-850 rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); setInfo(null) }}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${
                mode === 'signin' ? 'bg-base-700 text-base-100 shadow-sm' : 'text-base-400 hover:text-base-200'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); setInfo(null) }}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${
                mode === 'signup' ? 'bg-base-700 text-base-100 shadow-sm' : 'text-base-400 hover:text-base-200'
              }`}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-base-400 mb-1.5">
                  Nome completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-base-400 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-base-400 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-negative-500/10 border border-negative-500/30 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-negative-400 shrink-0 mt-0.5" />
                <p className="text-[13px] text-negative-400 leading-snug">{error}</p>
              </div>
            )}

            {info && (
              <div className="flex items-start gap-2 bg-positive-500/10 border border-positive-500/30 rounded-lg px-3 py-2.5">
                <ShieldCheck className="w-4 h-4 text-positive-400 shrink-0 mt-0.5" />
                <p className="text-[13px] text-positive-400 leading-snug">{info}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-60 text-base-950 font-bold text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-accent-500/20"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === 'signin' ? 'Entrar no sistema' : 'Criar minha conta'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-base-500 text-xs mt-6">
          Seus dados são protegidos e isolados por conta — apenas você acessa o que cadastra.
        </p>
      </div>
    </div>
  )
}
