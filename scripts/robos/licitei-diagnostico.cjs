// Perícia/forense compartilhada pelos robôs do Licitei. Quando algo falha
// (login, filtros, scraping), salva screenshot + HTML + console + chamadas
// de rede relevantes numa pasta que o workflow sobe como artefato do
// GitHub Actions — assim uma falha real vira evidência concreta pra
// diagnosticar, em vez de mais uma rodada de tentativa e erro às cegas.
const fs = require('fs')
const path = require('path')

const DIAG_DIR = process.env.DIAG_DIR || path.join(process.cwd(), 'diagnostico')

// Nunca deixa a senha/usuário reais vazarem pro HTML/JSON salvo (o valor
// pode acabar refletido no atributo "value" de um input controlado,
// dependendo do framework da página).
function redigir(texto) {
  if (!texto) return texto
  let out = texto
  if (process.env.LICITEI_SENHA) out = out.split(process.env.LICITEI_SENHA).join('[SENHA_REDIGIDA]')
  if (process.env.LICITEI_USUARIO) out = out.split(process.env.LICITEI_USUARIO).join('[USUARIO_REDIGIDO]')
  return out
}

// Escuta console, erros de página e chamadas xhr/fetch desde já — se só
// começássemos a escutar depois que a falha acontecer, teríamos perdido o
// que rolou durante o clique de login.
function iniciarCaptura(page) {
  const consoleMsgs = []
  const network = []
  page.on('console', (msg) => consoleMsgs.push(`[console.${msg.type()}] ${msg.text()}`))
  page.on('pageerror', (err) => consoleMsgs.push(`[pageerror] ${err.message}`))
  page.on('response', async (res) => {
    const req = res.request()
    if (!['xhr', 'fetch'].includes(req.resourceType())) return
    let corpo = ''
    try {
      corpo = redigir((await res.text()).slice(0, 800))
    } catch {
      corpo = '(corpo não pôde ser lido)'
    }
    network.push({ url: res.url(), method: req.method(), status: res.status(), corpo })
  })
  return { consoleMsgs, network }
}

async function salvarDiagnostico(page, prefixo, captura) {
  try {
    fs.mkdirSync(DIAG_DIR, { recursive: true })
    await page.screenshot({ path: path.join(DIAG_DIR, `${prefixo}.png`), fullPage: true }).catch(() => {})
    const html = await page.content().catch(() => '')
    fs.writeFileSync(path.join(DIAG_DIR, `${prefixo}.html`), redigir(html))
    if (captura) {
      fs.writeFileSync(path.join(DIAG_DIR, `${prefixo}-console.log`), captura.consoleMsgs.join('\n'))
      fs.writeFileSync(path.join(DIAG_DIR, `${prefixo}-network.json`), JSON.stringify(captura.network, null, 2))
    }
    console.log(`[diagnostico] Salvo: ${prefixo}.png / .html / -console.log / -network.json em ${DIAG_DIR}`)
  } catch (err) {
    console.warn('[diagnostico] Falha ao salvar diagnóstico (não fatal):', err.message)
  }
}

module.exports = { iniciarCaptura, salvarDiagnostico, DIAG_DIR }
