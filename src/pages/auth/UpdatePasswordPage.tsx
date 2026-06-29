import { useState, type FormEvent } from 'react'
import { ShieldCheck, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function UpdatePasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('As senhas digitadas não coincidem.')
      return
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError('Não foi possível atualizar a senha. O link pode ter expirado — solicite um novo.')
      return
    }
    setSuccess(true)
  }

  return (
    <div className="min-h-screen bg-base-950 flex items-center justify-center p-4">
      <div className="relative w-full max-w-[420px] animate-rise">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-400 flex items-center justify-center shadow-lg shadow-accent-500/20 mb-4">
            <ShieldCheck className="w-7 h-7 text-base-950" strokeWidth={2.4} />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-base-100 tracking-tight">ConectaGov</h1>
        </div>

        <div className="bg-base-900 border border-base-700/60 rounded-2xl p-7 shadow-2xl shadow-black/40">
          {success ? (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-positive-400 mx-auto mb-3" />
              <h2 className="font-display font-bold text-base text-base-100 mb-2">Senha atualizada!</h2>
              <p className="text-[13px] text-base-400 mb-5">Você já pode acessar o sistema normalmente com a nova senha.</p>
              <button
                onClick={onDone}
                className="w-full bg-accent-500 hover:bg-accent-400 text-base-950 font-bold text-sm py-2.5 rounded-lg transition"
              >
                Continuar
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-display font-bold text-base text-base-100 mb-1">Defina sua nova senha</h2>
              <p className="text-[13px] text-base-400 mb-5">Escolha uma senha com pelo menos 6 caracteres.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-base-400 mb-1.5">Nova senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-500" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-base-400 mb-1.5">Confirme a nova senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-500" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
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

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-60 text-base-950 font-bold text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
