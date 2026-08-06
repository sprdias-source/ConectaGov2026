// Login compartilhado pelos dois robôs do Licitei (buscar e baixar edital).
// Confirmado com o usuário: o login do Licitei não pede captcha nem
// segundo fator — só preencher e-mail/senha e confirmar, sem o esquema de
// captcha_sessions usado pelo robô CNDT.
//
// HISTÓRICO DE RODADAS REAIS (pra não repetir o mesmo erro de novo):
// 1ª rodada: clique acontecia antes da SPA hidratar e caía no envio HTML
//    nativo do form (GET, email/senha na query string). Corrigido esperando
//    'networkidle' antes de interagir.
// 2ª/3ª rodadas: o clique passou a disparar o login de verdade, mas a
//    confirmação de sucesso só olhava o DOM (campo de e-mail sumir da
//    tela) — o que é frágil: se a tela pós-login também tiver um
//    input[name=email] em outro lugar (ex: um form de perfil), dá falso
//    negativo; e se o login falhar sem nenhuma mensagem inline visível, a
//    gente só via "TimeoutError" sem saber o motivo real.
// Correção desta rodada: além do DOM, escuta a resposta de rede da própria
// chamada de autenticação (xhr/fetch) — o status HTTP dela é a fonte da
// verdade sobre sucesso/falha, não uma inferência visual. E qualquer
// desfecho ambíguo salva screenshot+HTML+rede como diagnóstico (artefato
// do workflow), pra próxima falha já vir com evidência completa.
const { iniciarCaptura, salvarDiagnostico } = require('./licitei-diagnostico.cjs')

async function loginLicitei(page) {
  const captura = iniciarCaptura(page)

  await page.goto('https://app.licitei.com.br/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.fill('input[name="email"]', process.env.LICITEI_USUARIO)
  await page.fill('input[name="password"]', process.env.LICITEI_SENHA)

  // Prepara a escuta ANTES do clique (senão a resposta pode chegar antes
  // da gente começar a esperar por ela). Regex ampla de propósito — não
  // sabemos o nome exato do endpoint; se não bater com nada, ainda temos o
  // -network.json completo (todo xhr/fetch) salvo no diagnóstico pra achar
  // o endpoint certo depois.
  const respostaAuthPromise = page
    .waitForResponse(
      (res) => /login|auth|session|sign-?in|token/i.test(res.url()) && res.request().method() !== 'GET',
      { timeout: 20000 }
    )
    .catch(() => null)

  await page.getByRole('button', { name: 'Fazer login' }).click()
  const respostaAuth = await respostaAuthPromise

  if (respostaAuth) {
    console.log(`[login] Resposta de auth observada: ${respostaAuth.status()} ${respostaAuth.url()}`)
  } else {
    console.log('[login] Nenhuma resposta de rede parecida com login/auth em 20s (fica registrado no diagnóstico se falhar a seguir).')
  }

  if (respostaAuth && respostaAuth.status() >= 400) {
    let corpo = ''
    try {
      corpo = (await respostaAuth.text()).slice(0, 500)
    } catch {}
    await salvarDiagnostico(page, 'login-falha-auth', captura)
    throw new Error(`Servidor do Licitei recusou o login (HTTP ${respostaAuth.status()}): ${corpo || '(sem corpo no retorno)'}`)
  }

  try {
    await page.locator('input[name="email"]').first().waitFor({ state: 'detached', timeout: 15000 })
  } catch {
    if (respostaAuth && respostaAuth.status() < 400) {
      // O servidor confirmou sucesso (2xx/3xx) mas o campo de e-mail ainda
      // está no DOM — provável falso negativo (outro elemento com o mesmo
      // seletor na tela pós-login). A resposta do servidor tem prioridade
      // sobre a inferência visual.
      console.log('[login] Auth respondeu OK mas o campo de e-mail ainda está na página — seguindo mesmo assim (resposta do servidor tem prioridade).')
      return
    }

    await salvarDiagnostico(page, 'login-sem-avancar', captura)

    const describedBy = await page.locator('input[name="email"]').first().getAttribute('aria-describedby').catch(() => null)
    let mensagem = null
    for (const id of (describedBy || '').split(' ')) {
      if (!id.endsWith('-message')) continue
      mensagem = (await page.locator(`#${id}`).textContent().catch(() => null))?.trim() || null
    }
    throw new Error(
      mensagem
        ? `Login não avançou — mensagem do formulário: "${mensagem}"`
        : 'Login não avançou da tela inicial e nenhuma resposta de auth foi capturada — screenshot/HTML/rede salvos em diagnostico/login-sem-avancar.* (artefato do workflow "diagnostico-licitei")'
    )
  }
}

module.exports = { loginLicitei }
