// Leitura/escrita do CSV de importação de propostas do Portal de Compras
// Públicas — dialeto específico confirmado num arquivo de exemplo real do
// portal (não é RFC 4180 genérico): separador ";", texto entre aspas
// duplas (aspas literal escapada como ""), fim de linha CRLF, e
// codificação ISO-8859-1 (Latin-1) — não UTF-8, senão acento vira lixo.
//
// Colunas do arquivo (A-F vêm preenchidas pelo portal, nunca mexer nelas;
// G-L vêm em branco pra o fornecedor preencher):
// A Processo | B ID | C Lote | D Item | E Produto | F Quantidade |
// G Modelo | H Marca/Fabricante | I ANVISA | J Descrição detalhada |
// K Valor unitário | L Valor total

export const COL_PROCESSO = 0
export const COL_ID = 1
export const COL_LOTE = 2
export const COL_ITEM = 3
export const COL_PRODUTO = 4
export const COL_QUANTIDADE = 5
export const COL_MODELO = 6
export const COL_MARCA = 7
export const COL_ANVISA = 8
export const COL_DESCRICAO = 9
export const COL_VALOR_UNITARIO = 10
export const COL_VALOR_TOTAL = 11
export const TOTAL_COLUNAS = 12

// Cabeçalho fixo exigido pelo Portal — confirmado num arquivo de exemplo
// real, caractere por caractere. O próprio Portal instrui "não modifique
// os títulos da linha 1", então é seguro deixar fixo aqui em vez de
// depender de sempre ter um arquivo-modelo pra copiar dele.
export const HEADER_PORTAL_COMPRAS = [
  'Número do Processo (Não edite)',
  'ID (Não edite)',
  'Lote (Não edite)',
  'Item (Não edite)',
  'Produto (Não edite)',
  'Quantidade (Não edite)',
  'Modelo (Insira as informações quando aplicável)',
  'Marca/Fabricante (Insira as informações quando aplicável)',
  'Código de Registro na ANVISA (Insira as informações quando aplicável)',
  'Descrição detalhada do Item (Insira as informações)',
  'Valor unitário (Insira as informações)',
  'Valor total (Insira as informações)',
]

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
