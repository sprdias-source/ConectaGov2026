import { useState, type FormEvent } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import Modal from './Modal'
import { Field, Input, Button } from './FormControls'
import ErrorAlert from './ErrorAlert'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

interface DeleteWithPasswordDialogProps {
  open: boolean
  title: string
  entityLabel: string
  financialWarning?: string
  onCancel: () => void
  onConfirm: () => void
  isLoading?: boolean
  error?: unknown
}

/**
 * Confirmação de exclusão definitiva, protegida por senha. Usado para
 * ações destrutivas que apagam histórico financeiro real (cliente,
 * licitação, empenho) — diferente do ConfirmDialog comum, que serve para
 * exclusões sem esse risco (ex: conta sem movimento, categoria).
 *
 * A senha é validada re-autenticando o próprio usuário contra o Supabase
 * Auth (signInWithPassword), sem expor nem armazenar a senha em lugar
 * nenhum além da chamada de rede direta ao Supabase.
 */
export default function DeleteWithPasswordDialog({
  open, title, entityLabel, financialWarning, onCancel, onConfirm, isLoading, error,
}: DeleteWithPasswordDialogProps) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)

  if (!open) return null

  const isLockedOut = failedAttempts >= 5

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user?.email || isLockedOut) return
    setChecking(true)
    setPasswordError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })

    setChecking(false)
    if (authError) {
      setFailedAttempts((n) => n + 1)
      setPasswordError(
        failedAttempts >= 4
          ? 'Muitas tentativas incorretas. Cancele e tente novamente em alguns minutos.'
          : 'Senha incorreta. Confirme sua senha de login para continuar.'
      )
      return
    }
    setPassword('')
    setFailedAttempts(0)
    onConfirm()
  }

  const handleCancel = () => {
    setPassword('')
    setPasswordError(null)
    setFailedAttempts(0)
    onCancel()
  }

  return (
    <Modal open={open} onClose={handleCancel} title={title} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-start gap-3 bg-negative-500/10 border border-negative-500/30 rounded-lg p-3">
          <AlertTriangle className="w-5 h-5 text-negative-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-negative-300">
              Esta ação é definitiva e não pode ser desfeita.
            </p>
            <p className="text-[12px] text-base-400 mt-1">
              {entityLabel} será excluído(a) permanentemente.
              {financialWarning && <> <strong className="text-negative-300">{financialWarning}</strong></>}
            </p>
          </div>
        </div>

        <p className="text-[13px] text-base-300">
          Se preferir manter o histórico, você pode <strong>inativar</strong> em vez de excluir — o registro deixa de aparecer no dia a dia, mas nada é perdido.
        </p>

        <Field label="Confirme sua senha de login para excluir" required>
          <Input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {passwordError && (
          <p className="text-[12px] text-negative-400">{passwordError}</p>
        )}
        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleCancel}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={checking || isLoading || !password || isLockedOut}>
            {checking || isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Excluir definitivamente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
