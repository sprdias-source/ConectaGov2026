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
