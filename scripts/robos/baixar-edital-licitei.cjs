// Robô Licitei — modo "baixar_edital".
// Abre a página de uma licitação específica (link_licitei já gravado em
// licitei_editais), acha o arquivo cujo nome COMEÇA com "EDITAL" entre os
// documentos anexados (nunca por posição — a ordem dos anexos varia de
// licitação pra licitação) e sobe o PDF pro bucket client-documents, na
// pasta do cliente já linkado a este edital.
const fs = require('fs/promises')
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const { loginLicitei } = require('./licitei-login.cjs')
const { iniciarCaptura, salvarDiagnostico } = require('./licitei-diagnostico.cjs')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EDITAL_ID = process.env.EDITAL_ID
const USER_ID = process.env.USER_ID

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  const inicio = Date.now()
  if (!EDITAL_ID || !USER_ID) {
    console.error('EDITAL_ID e USER_ID são obrigatórios (vieram do client_payload do dispatch)')
    process.exit(1)
  }

  const { data: edital, error: editalError } = await supabase
    .from('licitei_editais')
    .select('*')
    .eq('id', EDITAL_ID)
    .single()
  if (editalError || !edital) {
    console.error('Edital não encontrado:', editalError ? editalError.message : EDITAL_ID)
    process.exit(1)
  }
  if (!edital.link_licitei) {
    console.error('Este edital não tem link do Licitei salvo — não dá pra abrir a página dele.')
    process.exit(1)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const captura = iniciarCaptura(page)

  try {
    await loginLicitei(page)
    await page.goto(edital.link_licitei, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // A aba "Edital" é onde ficam os documentos anexados. Clica pelo TEXTO
    // visível da aba — nunca pelo id (o Licitei usa Radix UI, que gera um
    // id novo e aleatório a cada carregamento da página).
    await page.getByRole('tab', { name: 'Edital' }).click()
    await page.waitForTimeout(1000)

    const linhaEdital = page.locator('p, span, a').filter({ hasText: /^EDITAL\d/i }).first()
    await linhaEdital.waitFor({ timeout: 15000 })
    const nomeArquivo = ((await linhaEdital.textContent()) || 'edital.pdf').trim()
    console.log(`Arquivo do edital identificado: "${nomeArquivo}"`)

    // O botão de download fica na mesma linha/card do nome do arquivo —
    // sobe até o container mais próximo e procura o botão dentro dele, em
    // vez de mirar um seletor fixo (ajustar aqui se o layout real for
    // diferente do que os prints mostraram).
    const botaoDownload = linhaEdital.locator('xpath=ancestor::div[1]').getByRole('button').first()

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      botaoDownload.click(),
    ])

    const caminhoTemp = await download.path()
    if (!caminhoTemp) throw new Error('O download não gerou um arquivo local (path vazio)')
    const conteudo = await fs.readFile(caminhoTemp)

    const storagePath = `${USER_ID}/licitei/${edital.id}/edital.pdf`
    const { error: uploadError } = await supabase.storage
      .from('client-documents')
      .upload(storagePath, conteudo, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError

    const { error: updateError } = await supabase
      .from('licitei_editais')
      .update({ edital_storage_path: storagePath })
      .eq('id', edital.id)
    if (updateError) throw updateError

    console.log(`Concluído em ${Math.round((Date.now() - inicio) / 1000)}s — "${nomeArquivo}" salvo em ${storagePath}.`)
  } catch (err) {
    console.error('Erro no robô Licitei (baixar edital):', err)
    await salvarDiagnostico(page, 'baixar-edital-falha', captura)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
