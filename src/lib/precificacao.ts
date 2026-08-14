// Fórmula do markup divisor (mesma usada na Calculadora de Formação de
// Preço) aplicada aos Perfis de Precificação — Impostos, Despesas e Margem
// incidem sobre o PREÇO DE VENDA final, não sobre o custo, por isso a
// divisão em vez de multiplicação direta:
//   Valor Mínimo = Custo ÷ ((100 − Impostos% − Despesas% − Margem%) ÷ 100)
// Diferente do BDI da Calculadora (obras/serviços de engenharia), aqui
// Impostos e Despesas ficam separados em linhas próprias — mais perto do
// dia a dia de comércio/serviços (Simples Nacional, Lucro Presumido etc).
export function calcularValorMinimo(custo: number, impostosPct: number, despesasPct: number, margemPct: number): number | null {
  const divisor = (100 - impostosPct - despesasPct - margemPct) / 100
  if (divisor <= 0) return null
  return custo / divisor
}

export function somarLinhasPorTipo(linhas: { tipo: 'imposto' | 'despesa'; percentual: number }[], tipo: 'imposto' | 'despesa'): number {
  return linhas.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.percentual, 0)
}
