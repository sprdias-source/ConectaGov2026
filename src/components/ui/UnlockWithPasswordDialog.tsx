import { useEffect, useState, type FormEvent } from 'react'
import { Lock, Loader2 } from 'lucide-react'
import Modal from './Modal'
import { Field, Input, Button } from './FormControls'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { lerTentativas, gravarTentativas, limparTentativas } from '../../lib/passwordLockout'

interface UnlockWithPasswordDialogProps {
  open: boolean
  entityLabel: string
  // ID real da entidade (ex: bidding.id) — o contador de tentativas é
  // chaveado por isso, não pelo entityLabel (texto livre editável pelo
  // usuário, ver passwordLockout.ts pra por que isso importa).
  entityId: string
  onCancel: () => void
  onUnlocked: () => void
}

/**
 * Desbloqueio de edição protegido por senha — usado quando uma licitação já
 * está "Ganhou" + "Adjudicada e Homologada" (ver lib/biddingLock.ts), pra
 * evitar alteração acidental de dados já definitivos. Mesmo padrão de
 * reautenticação e bloqueio após 5 tentativas do DeleteWithPasswordDialog,
 * mas desbloqueia em vez de excluir.
 */
export default function UnlockWithPasswordDialog({
  open, entityLabel, entityId, onCancel, onUnlocked,
}: UnlockWithPasswordDialogProps) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancelado = false
    lerTentativas('bidding_unlock', entityId).then((n) => {
      if (!cancelado) setFailedAttempts(n)
    })
    return () => { cancelado = true }
  }, [open, entityId])

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
      const novaContagem = failedAttempts + 1
      setFailedAttempts(novaContagem)
      await gravarTentativas('bidding_unlock', entityId, novaContagem)
      setPasswordError(
        failedAttempts >= 4
          ? 'Muitas tentativas incorretas. Cancele e tente novamente em alguns minutos.'
          : 'Senha incorreta. Confirme sua senha de login para continuar.'
      )
      return
    }
    setPassword('')
    setFailedAttempts(0)
    await limparTentativas('bidding_unlock', entityId)
    onUnlocked()
  }

  const handleCancel = () => {
    setPassword('')
    setPasswordError(null)
    onCancel()
  }

  return (
    <Modal open={open} onClose={handleCancel} title="Desbloquear edição" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-start gap-3 bg-accent-500/10 border border-accent-500/30 rounded-lg p-3">
          <Lock className="w-5 h-5 text-accent-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-accent-300">{entityLabel} está bloqueada para edição.</p>
            <p className="text-[12px] text-base-400 mt-1">
              Esta licitação já está <strong>Ganhou</strong> e na etapa <strong>Adjudicada e Homologada</strong> — os dados são considerados definitivos. Confirme sua senha de login para editar mesmo assim.
            </p>
          </div>
        </div>

        <Field label="Confirme sua senha de login para desbloquear" required>
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

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleCancel}>Cancelar</Button>
          <Button type="submit" disabled={checking || !password || isLockedOut}>
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Desbloquear'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
