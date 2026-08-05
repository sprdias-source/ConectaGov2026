// Login compartilhado pelos dois robôs do Licitei (buscar e baixar edital).
// Confirmado com o usuário: o login do Licitei não pede captcha nem
// segundo fator — só preencher e-mail/senha e confirmar, sem o esquema de
// captcha_sessions usado pelo robô CNDT.
async function loginLicitei(page) {
  await page.goto('https://app.licitei.com.br/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.fill('input[name="email"]', process.env.LICITEI_USUARIO)
  await page.fill('input[name="password"]', process.env.LICITEI_SENHA)
  await page.getByRole('button', { name: 'Fazer login' }).click()
  await page.waitForURL(/dashboard/, { timeout: 30000 })
}

module.exports = { loginLicitei }
