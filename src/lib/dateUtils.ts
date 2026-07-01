// CORREÇÃO DE BUG: `new Date().toISOString().slice(0, 10)` retorna a data
// em UTC, não no horário local do usuário. No Brasil (UTC-3), entre 21h e
// 23h59 de qualquer dia, isso já considera "hoje" como o dia seguinte -
// o que distorce silenciosamente: status "Vence Hoje", data de pagamento
// padrão ao dar baixa, e qualquer filtro de "hoje" usado no sistema.
//
// Esta função usa os componentes de data locais (getFullYear/getMonth/
// getDate, que respeitam o fuso horário do navegador do usuário) em vez
// de toISOString, garantindo que "hoje" seja realmente hoje no relogio
// de quem esta usando o sistema.
export function todayLocalISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Mesma lógica de todayLocalISO, mas para um objeto Date arbitrário (não
// necessariamente "agora") — usado depois de somar/subtrair meses de uma
// data com setMonth(). Nunca usa toISOString(), que converteria para UTC
// e poderia mudar o dia exibido dependendo do fuso horário do navegador.
export function dateToLocalISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
