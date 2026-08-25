// Contador de tentativas de senha erradas, persistido no sessionStorage sob
// uma chave que identifica o que está sendo confirmado — sobrevive a
// fechar/reabrir o diálogo (senão o "bloqueio após 5 tentativas" seria só
// cosmético: erra a senha, cancela, abre de novo, contador zera). Expira
// sozinho depois de alguns minutos e é limpo assim que a senha é aceita — a
// autenticação real sempre é validada no servidor via
// supabase.auth.signInWithPassword; isso aqui só evita que o contador
// visual seja furado fechando e reabrindo o diálogo. Compartilhado entre
// DeleteWithPasswordDialog (excluir) e UnlockWithPasswordDialog (desbloquear
// edição) — mesma regra de segurança, mesmo código.
const LOCKOUT_RESET_MS = 5 * 60 * 1000 // 5 minutos

export function lerTentativas(chave: string): number {
  try {
    const raw = sessionStorage.getItem(chave)
    if (!raw) return 0
    const { count, ts } = JSON.parse(raw) as { count: number; ts: number }
    if (Date.now() - ts > LOCKOUT_RESET_MS) {
      sessionStorage.removeItem(chave)
      return 0
    }
    return count
  } catch {
    return 0
  }
}

export function gravarTentativas(chave: string, count: number) {
  try {
    sessionStorage.setItem(chave, JSON.stringify({ count, ts: Date.now() }))
  } catch {
    // sessionStorage indisponível (aba anônima, navegador bloqueando etc.)
    // — degrada pra contador só em memória, sem quebrar o fluxo.
  }
}

export function limparTentativas(chave: string) {
  try {
    sessionStorage.removeItem(chave)
  } catch {
    // ignora — mesmo motivo do gravarTentativas acima.
  }
}
