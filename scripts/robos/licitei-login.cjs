// Login compartilhado pelos dois robôs do Licitei (buscar e baixar edital).
// Confirmado com o usuário: o login do Licitei não pede captcha nem
// segundo fator — só preencher e-mail/senha e confirmar, sem o esquema de
// captcha_sessions usado pelo robô CNDT.
async function loginLicitei(page) {
  // 'networkidle' (não só 'domcontentloaded'): dá tempo da SPA hidratar e
  // conectar o handler de clique de verdade antes da gente interagir. Sem
  // isso, um clique "cedo demais" no botão pode cair no envio HTML nativo
  // do formulário (GET, com email/senha indo pra query string da URL) em
  // vez do login de verdade da aplicação — foi exatamente isso que
  // aconteceu na primeira rodada real (ver logs do Actions).
  await page.goto('https://app.licitei.com.br/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.fill('input[name="email"]', process.env.LICITEI_USUARIO)
  await page.fill('input[name="password"]', process.env.LICITEI_SENHA)
  await page.getByRole('button', { name: 'Fazer login' }).click()
  // Não sabemos ao certo qual é a URL da área logada (nunca confirmada com
  // o usuário), então detectamos sucesso pela SAÍDA da tela de login — o
  // campo de e-mail deixa de existir na página assim que o login é aceito
  // — em vez de arriscar um regex de URL que pode nunca bater.
  await page.locator('input[name="email"]').waitFor({ state: 'detached', timeout: 30000 })
}

module.exports = { loginLicitei }
