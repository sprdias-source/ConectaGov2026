// Leitura/escrita do CSV de importação de propostas do Portal de Compras
// Públicas — dialeto específico confirmado em arquivos de exemplo reais do
// portal (não é RFC 4180 genérico): separador ";", texto entre aspas
// duplas (aspas literal escapada como ""), fim de linha CRLF, e
// codificação ISO-8859-1 (Latin-1) — não UTF-8, senão acento vira lixo.
//
// Colunas do arquivo (as "Não edite" vêm preenchidas pelo portal e nunca
// são mexidas; as demais vêm em branco pra o fornecedor preencher):
// Processo | ID | [Lote] | Item | Produto | Quantidade | Modelo |
// Marca/Fabricante | ANVISA | Descrição detalhada | Valor unitário |
// Valor total
//
// A coluna Lote é OPCIONAL — confirmado comparando modelos reais de
// licitações diferentes: quando o processo não tem lotes (só itens
// avulsos), o Portal nem gera essa coluna, e o arquivo sai com 11 colunas
// em vez de 12. Por isso a leitura nunca assume uma quantidade fixa de
// colunas nem uma posição fixa pra cada uma — acha cada coluna pelo texto
// do próprio cabeçalho do arquivo (ver detectarColunasPortal).

export type ColunasPortal = {
  processo: number
  id: number
  lote: number | null
  item: number
  produto: number
  quantidade: number
  modelo: number
  marca: number
  anvisa: number
  descricao: number
  valorUnitario: number
  valorTotal: number
}

function chavePortal(celula: string): string {
  return celula.split('(')[0].trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Localiza cada coluna pelo texto do cabeçalho (a parte antes do
// parêntese explicativo, ex: "ID (Não edite)" -> "id"), em vez de supor
// uma posição fixa — só assim dá pra aceitar tanto o modelo com Lote
// quanto o modelo sem Lote. Devolve null se faltar alguma coluna
// obrigatória, sinal de que o arquivo enviado não é um modelo do Portal.
export function detectarColunasPortal(cabecalho: string[]): ColunasPortal | null {
  const chaves = cabecalho.map(chavePortal)
  const processo = chaves.indexOf('numero do processo')
  const id = chaves.indexOf('id')
  const lote = chaves.indexOf('lote')
  const item = chaves.indexOf('item')
  const produto = chaves.indexOf('produto')
  const quantidade = chaves.indexOf('quantidade')
  const modelo = chaves.indexOf('modelo')
  const marca = chaves.findIndex((c) => c.startsWith('marca'))
  const anvisa = chaves.findIndex((c) => c.includes('anvisa'))
  const descricao = chaves.findIndex((c) => c.startsWith('descricao'))
  const valorUnitario = chaves.indexOf('valor unitario')
  const valorTotal = chaves.indexOf('valor total')
  const obrigatorias = [processo, id, item, produto, quantidade, modelo, marca, anvisa, descricao, valorUnitario, valorTotal]
  if (obrigatorias.some((i) => i < 0)) return null
  return { processo, id, lote: lote >= 0 ? lote : null, item, produto, quantidade, modelo, marca, anvisa, descricao, valorUnitario, valorTotal }
}

export function parseCsvPortal(texto: string): string[][] {
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let dentroDeAspas = false
  let i = 0
  while (i < texto.length) {
    const c = texto[i]
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 2; continue }
        dentroDeAspas = false; i++; continue
      }
      campo += c; i++; continue
    }
    if (c === '"') { dentroDeAspas = true; i++; continue }
    if (c === ';') { linha.push(campo); campo = ''; i++; continue }
    if (c === '\r' && texto[i + 1] === '\n') { linha.push(campo); linhas.push(linha); campo = ''; linha = []; i += 2; continue }
    if (c === '\n') { linha.push(campo); linhas.push(linha); campo = ''; linha = []; i++; continue }
    campo += c; i++
  }
  if (campo !== '' || linha.length > 0) { linha.push(campo); linhas.push(linha) }
  // Descarta só linhas totalmente vazias (ex: quebra de linha final do
  // arquivo) — uma linha com campos vazios mas separadores presentes
  // continua sendo uma linha de dados de verdade.
  return linhas.filter((l) => !(l.length === 1 && l[0] === ''))
}

function campoCsv(valor: string): string {
  if (valor.includes(';') || valor.includes('"') || valor.includes('\n') || valor.includes('\r')) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

export function stringifyCsvPortal(linhas: string[][]): string {
  return linhas.map((l) => l.map(campoCsv).join(';')).join('\r\n') + '\r\n'
}

// Blob em ISO-8859-1 de verdade — TextEncoder do navegador só sabe gerar
// UTF-8, então converte cada caractere pro seu code point via charCodeAt
// (todo caractere usado neste arquivo, incluindo acentos do português,
// cabe no intervalo 0-255 do Latin-1, então essa conversão é exata).
export function textoParaBlobLatin1(texto: string): Blob {
  const bytes = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i) & 0xff
  return new Blob([bytes], { type: 'text/csv' })
}

// Caminho inverso de textoParaBlobLatin1 — usado pra reler um modelo do
// Portal já salvo no Storage (mesma codificação ISO-8859-1 do arquivo
// original, então TextDecoder nativo do navegador dá conta sozinho).
export function bufferParaTextoLatin1(buffer: ArrayBuffer): string {
  return new TextDecoder('iso-8859-1').decode(buffer)
}

export function formatarNumeroPtBR(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
