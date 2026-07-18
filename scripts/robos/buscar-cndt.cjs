// Robô CNDT — versão GitHub Actions/Playwright.
// Substitui a automação que rodava no Browserless (BQL) por um script Node
// rodando num runner do GitHub Actions, disparado sob demanda pela Edge
// Function `disparar-robo-cndt`. Reaproveita o MESMO design de captcha
// manual que já existia no `buscar-cndt` original (tabela `captcha_sessions`,
// polling até aparecer uma resposta) — só que agora a espera acontece aqui,
// em Node, com service role (sem precisar do token do usuário, diferente do
// BQL que rodava dentro do próprio navegador remoto).
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLIENT_ID = process.env.CLIENT_ID
const CNPJ = (process.env.CNPJ || '').replace(/\D/g, '')
const USER_ID = process.env.USER_ID

// Como não dependemos mais de uma sessão paga por segundo (Browserless),
// dá pra dar bem mais tempo pro usuário digitar o captcha com calma.
const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutos
const POLL_INTERVAL_MS = 3000

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function registrarLog(status, erro, inicio) {
  try {
    await supabase.from('document_logs').insert({
      user_id: USER_ID,
      client_id: CLIENT_ID,
      tipo: 'cndt',
      status,
      duracao_ms: Date.now() - inicio,
      erro: erro ? String(erro).slice(0, 500) : null,
    })
  } catch (e) {
    console.warn('Falha ao gravar log:', e)
  }
}

async function main() {
  const inicio = Date.now()
  if (!CLIENT_ID || !CNPJ || !USER_ID) {
    console.error('CLIENT_ID, CNPJ e USER_ID são obrigatórios (vieram do client_payload do dispatch)')
    process.exit(1)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  let sessaoId = null

  try {
    await page.goto('https://cndt-certidao.tst.jus.br/gerarCertidao.faces', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForTimeout(2000)

    await page.fill("input[name='gerarCertidaoForm:cpfCnpj']", CNPJ)
    await page.waitForTimeout(1000)

    const imgSrc = await page.getAttribute('img#idImgBase64', 'src')
    if (!imgSrc) throw new Error('Não encontrei a imagem do captcha na página (o site pode ter mudado a estrutura)')

    const expiraEm = new Date(Date.now() + POLL_TIMEOUT_MS + 5000).toISOString()
    const { data: sessao, error: erroSessao } = await supabase
      .from('captcha_sessions')
      .insert({
        user_id: USER_ID,
        client_id: CLIENT_ID,
        tipo: 'cndt',
        imagem_base64: imgSrc,
        status: 'aguardando',
        expira_em: expiraEm,
      })
      .select('id')
      .single()

    if (erroSessao || !sessao) {
      throw new Error('Não foi possível criar a sessão de captcha: ' + (erroSessao ? erroSessao.message : 'motivo desconhecido'))
    }
    sessaoId = sessao.id
    console.log('Sessão de captcha criada:', sessaoId, '— aguardando resposta pelo ConectaGov...')

    const deadline = Date.now() + POLL_TIMEOUT_MS
    let resposta = null
    while (Date.now() < deadline) {
      const { data: row } = await supabase
        .from('captcha_sessions')
        .select('status, resposta')
        .eq('id', sessaoId)
        .single()
      if (row && row.status === 'respondida' && row.resposta) {
        resposta = row.resposta
        break
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    if (!resposta) {
      await supabase.from('captcha_sessions').update({ status: 'expirada' }).eq('id', sessaoId)
      await registrarLog('erro', 'Tempo esgotado esperando o usuário digitar o captcha', inicio)
      console.error('Tempo esgotado esperando a resposta do captcha.')
      process.exitCode = 1
      return
    }

    await page.fill('input#idCampoResposta', resposta)
    await page.click("input[value='Emitir Certidão'], input[type='submit']")
    await page.waitForTimeout(3000)

    const pageText = (await page.textContent('body')) || ''
    const isPositiva = pageText.toLowerCase().includes('positiva')
    const voltouVazio = pageText.includes('Informe o número do CNPJ')

    if (voltouVazio) {
      await supabase.from('captcha_sessions').update({ status: 'usada' }).eq('id', sessaoId)
      throw new Error('O portal voltou ao formulário vazio — captcha incorreto ou sessão expirada no site do TST')
    }

    if (isPositiva) {
      await supabase.from('captcha_sessions').update({ status: 'usada' }).eq('id', sessaoId)
      await registrarLog('erro', 'CNDT positiva (débitos trabalhistas)', inicio)
      console.error('CNDT POSITIVA — o CNPJ possui débitos trabalhistas.')
      process.exitCode = 1
      return
    }

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
    await supabase.from('captcha_sessions').update({ status: 'usada' }).eq('id', sessaoId)

    const hoje = new Date()
    const dataEmissao = hoje.toISOString().split('T')[0]
    const validade = new Date(hoje)
    validade.setDate(validade.getDate() + 180)
    const dataValidade = validade.toISOString().split('T')[0]

    const path = `${USER_ID}/${CLIENT_ID}/cndt/cndt_${dataEmissao}.pdf`
    const { error: erroUpload } = await supabase.storage
      .from('documents')
      .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    await supabase.from('client_documents').upsert(
      {
        user_id: USER_ID,
        client_id: CLIENT_ID,
        tipo: 'cndt',
        nome: 'CNDT — Certidão Negativa de Débitos Trabalhistas (TST)',
        storage_path: erroUpload ? null : path,
        data_emissao: dataEmissao,
        data_validade: dataValidade,
        status: 'valido',
        auto_renovavel: true,
      },
      { onConflict: 'user_id,client_id,tipo' }
    )

    await registrarLog('sucesso', null, inicio)
    console.log('CNDT emitida com sucesso.')
  } catch (err) {
    console.error('Erro no robô CNDT:', err)
    if (sessaoId) {
      await supabase.from('captcha_sessions').update({ status: 'expirada' }).eq('id', sessaoId)
    }
    await registrarLog('erro', err, inicio)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
