// Converte valores de planilhas (Excel/CSV) para número de forma segura,
// aceitando tanto o formato brasileiro (vírgula decimal, ponto de milhar)
// quanto o formato internacional (ponto decimal) — sem isso, importar uma
// planilha com "1.234,56" resultava em NaN silencioso, mascarado por
// fallbacks (`|| 0`), e o valor errado entrava no sistema sem nenhum aviso.
export function parseFlexibleNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return Number.isFinite(val) ? val : null

  let str = String(val).trim()
  if (!str) return null

  str = str.replace(/R\$\s*/i, '').replace(/\s/g, '')

  // "1.234.567" (DOIS OU MAIS grupos de milhar, sem vírgula nenhuma) só
  // pode ser separador de milhar — um número decimal nunca tem mais de um
  // ponto. Sem isso, parseFloat truncava no segundo ponto (virava 1.234
  // em vez de 1234567). O caso de UM ÚNICO ponto com exatamente 3 dígitos
  // (ex: "1.234") continua ambíguo de propósito — pode ser "1234" (milhar
  // BR) ou "1,234" literal — e não é alterado aqui, pra não arriscar
  // reinterpretar um valor decimal de verdade como se fosse milhar.
  if (!str.includes(',') && /^\d{1,3}(\.\d{3}){2,}$/.test(str)) {
    str = str.replace(/\./g, '')
  }

  const lastComma = str.lastIndexOf(',')
  const lastDot = str.lastIndexOf('.')

  if (lastComma > lastDot) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma && lastComma !== -1) {
    str = str.replace(/,/g, '')
  } else if (lastComma !== -1) {
    str = str.replace(',', '.')
  }

  const parsed = parseFloat(str)
  return Number.isFinite(parsed) ? parsed : null
}

// "Ordenação natural" pro campo Nº do item (numero_item é texto livre —
// "1", "2", ..., "10", às vezes "1A", "10-B" etc). Sem isso, um ORDER BY
// direto no Postgres (lexicográfico) ou um .sort() padrão do JS colocam
// "10" antes de "2" — é exatamente esse bug que faz a lista de itens
// aparecer fora de ordem depois do item 9.
export function compararNumeroItem(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

// Normaliza um número de item pra CASAR entre fontes diferentes que
// descrevem o mesmo item de formas distintas — ex: a IA extrai "0001" do
// texto do edital (com zeros à esquerda), mas o CSV-modelo do Portal traz
// "1" (sem). String puramente numérica vira o número sem zeros à
// esquerda; qualquer outra coisa (ex: "1A", "Lote 2 - Item 3") só é
// aparada de espaços, pra manter comparação exata.
export function normalizarNumeroItem(valor: string): string {
  const aparado = valor.trim()
  return /^\d+$/.test(aparado) ? String(Number(aparado)) : aparado
}
