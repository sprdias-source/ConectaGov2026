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
