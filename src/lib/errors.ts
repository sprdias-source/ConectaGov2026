// Erros do Postgrest/Storage (Supabase) são objetos simples com .message,
// não instância de Error — String(err) neles vira literalmente
// "[object Object]" em vez do motivo real. Usado em qualquer catch que
// precise mostrar o erro pro usuário.
export function mensagemDeErro(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}
