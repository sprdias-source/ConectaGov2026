// Robô Licitei — modo "buscar".
// Loga no Licitei, aplica os filtros de uma busca salva (licitei_buscas) e
// grava cada resultado novo em licitei_editais com status='novo'. De
// propósito, não tenta extrair todos os campos (órgão, modalidade etc.) da
// tela de resultados — só título e link. O resto (objeto, órgão,
// modalidade, itens...) já é extraído de verdade pela análise de IA
// (Analisar-oportunidade) quando o edital baixado for enviado pra
// Oportunidades, então duplicar esse trabalho aqui só adicionaria mais
// seletores frágeis sem necessidade.
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const { loginLicitei } = require('./licitei-login.cjs')
const { aplicarFiltros } = require('./licitei-filtros.cjs')
const { iniciarCaptura, salvarDiagnostico } = require('./licitei-diagnostico.cjs')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUSCA_ID = process.env.BUSCA_ID
const USER_ID = process.env.USER_ID

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Tenta separar "PREGÃO ELETRÔNICO 44/2026 EMPRESA" em modalidade + número
// — só um bônus (a IA corrige/completa isso depois de qualquer forma), não
// falha a gravação do edital se o título vier num formato diferente.
function extrairDoTitulo(titulo) {
  const match = titulo.match(/^(.+?)\s+(\d{1,6}\/\d{4})\b/)
  return {
    modalidade: match ? match[1].trim() : null,
    numeroEdital: match ? match[2] : null,
  }
}

async function main() {
  const inicio = Date.now()
  if (!BUSCA_ID || !USER_ID) {
    console.error('BUSCA_ID e USER_ID são obrigatórios (vieram do client_payload do dispatch)')
    process.exit(1)
  }

  const { data: busca, error: buscaError } = await supabase
    .from('licitei_buscas')
    .select('*')
    .eq('id', BUSCA_ID)
    .single()
  if (buscaError || !busca) {
    console.error('Busca salva não encontrada:', buscaError ? buscaError.message : BUSCA_ID)
    process.exit(1)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const captura = iniciarCaptura(page)

  try {
    console.log(`Buscando "${busca.nome}"...`)
    await loginLicitei(page)

    console.log(`[buscar] Pós-login — URL: ${page.url()} | título: "${await page.title()}"`)
    await salvarDiagnostico(page, 'pos-login', captura)

    // NÃO fazer page.goto() pra uma URL adivinhada aqui: uma rodada real
    // mostrou que isso força um reload completo da página e derruba a
    // sessão de volta pra tela de login — o Licitei guarda o estado de
    // login em memória do lado do cliente (SPA), não só em cookie de
    // sessão, então um hard-reload pra uma URL "chutada" é destrutivo.
    // Em vez disso, navega clicando dentro da própria aplicação, como um
    // usuário real faria.
    try {
      const textosNav = await page
        .locator('nav a, nav button, header a, header button, aside a, aside button, [role="navigation"] a, [role="navigation"] button')
        .allTextContents()
      console.log('[buscar] Textos de navegação encontrados pós-login:', JSON.stringify([...new Set(textosNav.map((t) => t.trim()).filter(Boolean))]))
    } catch (err) {
      console.warn('[buscar] Não consegui listar a navegação pós-login:', err.message)
    }

    const candidatosPesquisa = ['Pesquisar', 'Pesquisa', 'Nova pesquisa', 'Buscar', 'Filtros de Pesquisa', 'Editais']
    let achouNavPesquisa = false
    for (const nome of candidatosPesquisa) {
      const link = page.getByRole('link', { name: nome, exact: false }).or(page.getByRole('button', { name: nome, exact: false })).first()
      if (await link.count().catch(() => 0)) {
        console.log(`[buscar] Clicando em navegação "${nome}" pra ir pra pesquisa...`)
        await link.click({ timeout: 6000 }).catch((err) => console.warn(`[buscar] falha ao clicar em "${nome}": ${err.message}`))
        achouNavPesquisa = true
        break
      }
    }
    if (!achouNavPesquisa) {
      console.warn('[buscar] Não achei nenhum link/botão de navegação óbvio pra pesquisa — ver a lista de "Textos de navegação" acima pra descobrir o nome certo.')
    }
    await page.waitForTimeout(1500)

    console.log(`[buscar] Depois de tentar navegar pra pesquisa — URL: ${page.url()} | título: "${await page.title()}"`)
    // Captura incondicional (sucesso ou falha): os campos de filtro falham
    // silenciosamente um a um (try/catch próprio, ver licitei-filtros.cjs),
    // então sem isso uma rodada "bem sucedida" com 0 resultados não deixa
    // nenhuma evidência de qual página realmente carregou.
    await salvarDiagnostico(page, 'apos-navegar-pesquisar', captura)

    await aplicarFiltros(page, busca.filtros || {})
    await salvarDiagnostico(page, 'apos-filtros', captura)
    await page.waitForTimeout(2500) // dá tempo da lista recarregar depois dos filtros

    const cards = page.locator('div.grid.gap-6 header a')
    const total = await cards.count()
    console.log(`${total} resultado(s) na tela.`)

    let novos = 0
    let jaExistiam = 0
    for (let i = 0; i < total; i++) {
      const card = cards.nth(i)
      const href = await card.getAttribute('href')
      if (!href) continue
      const link = new URL(href, 'https://app.licitei.com.br').toString()

      const { data: existente } = await supabase
        .from('licitei_editais')
        .select('id')
        .eq('link_licitei', link)
        .maybeSingle()
      if (existente) {
        jaExistiam++
        continue
      }

      const titulo = ((await card.locator('h3').textContent()) || '').trim()
      const { modalidade, numeroEdital } = extrairDoTitulo(titulo)

      const { error: insertError } = await supabase.from('licitei_editais').insert({
        user_id: USER_ID,
        objeto: titulo || null,
        modalidade,
        numero_edital: numeroEdital,
        link_licitei: link,
        status: 'novo',
        busca_id: BUSCA_ID,
      })
      if (insertError) {
        console.warn(`Falha ao gravar "${titulo}": ${insertError.message}`)
        continue
      }
      novos++
    }

    await supabase.from('licitei_buscas').update({ ultima_execucao_em: new Date().toISOString() }).eq('id', BUSCA_ID)
    console.log(`Concluído em ${Math.round((Date.now() - inicio) / 1000)}s — ${novos} novo(s), ${jaExistiam} já cadastrado(s).`)
  } catch (err) {
    console.error('Erro no robô Licitei (buscar):', err)
    await salvarDiagnostico(page, 'buscar-falha', captura)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
