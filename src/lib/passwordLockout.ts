import { supabase } from './supabase'

// Contador de tentativas de senha erradas, persistido no BANCO (tabela
// password_unlock_attempts — ver migração 047), associado ao usuário
// autenticado + ao ID real da entidade sendo confirmada (nunca a um texto
// livre como o "objeto" da licitação, que pode ser editado a qualquer
// momento). Antes vivia no sessionStorage sob uma chave montada com esse
// texto mutável — bastava fechar a aba OU corrigir um typo no campo usado
// na chave pra resetar o contador, tornando o "bloqueio após 5 tentativas"
// cosmético. A autenticação real sempre foi validada no servidor via
// supabase.auth.signInWithPassword; isso aqui só evita que o AVISO de
// bloqueio seja furado tão facilmente. Compartilhado entre
// DeleteWithPasswordDialog (excluir) e UnlockWithPasswordDialog
// (desbloquear edição) — mesma regra de segurança, mesmo código.
const LOCKOUT_RESET_MS = 5 * 60 * 1000 // 5 minutos

export async function lerTentativas(entityType: string, entityId: string): Promise<number> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    const { data } = await supabase
      .from('password_unlock_attempts')
      .select('failed_count, updated_at')
      .eq('user_id', user.id)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .maybeSingle()
    if (!data) return 0
    if (Date.now() - new Date(data.updated_at).getTime() > LOCKOUT_RESET_MS) {
      await limparTentativas(entityType, entityId)
      return 0
    }
    return data.failed_count
  } catch {
    return 0
  }
}

export async function gravarTentativas(entityType: string, entityId: string, count: number) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('password_unlock_attempts').upsert(
      { user_id: user.id, entity_type: entityType, entity_id: entityId, failed_count: count, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,entity_type,entity_id' }
    )
  } catch {
    // Sem rede/banco indisponível — degrada pra contador só em memória no
    // componente, sem quebrar o fluxo de confirmação de senha.
  }
}

export async function limparTentativas(entityType: string, entityId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('password_unlock_attempts').delete()
      .eq('user_id', user.id).eq('entity_type', entityType).eq('entity_id', entityId)
  } catch {
    // idem — melhor esforço, nunca bloqueia a ação já autenticada.
  }
}
