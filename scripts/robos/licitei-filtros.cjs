// Preenche o painel "Filtros de Pesquisa" do Licitei a partir de um
// LicitaiBuscaFiltros (ver src/types/domain.ts — mesmo formato salvo pela
// tela "Buscas Salvas" do ConectaGov). Cada campo é best-effort e isolado
// num try/catch próprio: se um seletor não bater (o Licitei pode reorganizar
// a tela), o robô avisa no log e segue preenchendo o resto, em vez de
// travar a busca inteira por causa de um único filtro.

async function preencherTexto(page, placeholder, valor) {
  if (!valor) return
  try {
    await page.getByPlaceholder(placeholder).first().fill(String(valor))
  } catch (err) {
    console.warn(`[filtros] não consegui preencher "${placeholder}": ${err.message}`)
  }
}

async function selecionarComboBox(page, placeholder, valorTexto) {
  if (!valorTexto) return
  try {
    await page.getByPlaceholder(placeholder).first().click()
    await page.getByRole('option', { name: valorTexto, exact: false }).first().click()
  } catch (err) {
    console.warn(`[filtros] não consegui selecionar "${valorTexto}" em "${placeholder}": ${err.message}`)
  }
}

async function clicarCheckboxPeloLabel(page, texto) {
  try {
    await page.getByText(texto, { exact: true }).first().click()
  } catch (err) {
    console.warn(`[filtros] não consegui marcar o checkbox "${texto}": ${err.message}`)
  }
}

async function preencherMinMax(page, indice, min, max) {
  try {
    if (min != null) await page.getByPlaceholder('Min').nth(indice).fill(String(min))
    if (max != null) await page.getByPlaceholder('Max').nth(indice).fill(String(max))
  } catch (err) {
    console.warn(`[filtros] não consegui preencher valor min/max (índice ${indice}): ${err.message}`)
  }
}

// ATENÇÃO: tipoData/período, o slider de "Raio de distância" e modo de
// disputa/esfera ainda não foram testados contra a tela real do Licitei —
// os seletores abaixo são um primeiro palpite a partir dos prints
// recebidos. Prováveis pontos de ajuste depois da primeira rodada real
// (ver os logs "[filtros] não consegui..." no GitHub Actions).
async function aplicarFiltros(page, filtros) {
  await preencherTexto(page, 'Digite o que você quer vender hoje', filtros.palavraChave)

  if (filtros.modalidade) await selecionarComboBox(page, 'Selecionar modalidade', filtros.modalidade)

  if (filtros.localizacaoModo === 'raio_distancia') {
    if (filtros.cidade) await selecionarComboBox(page, 'Selecionar cidade', filtros.cidade)
    // Slider — não dá pra "clicar numa opção" como nos combobox; arrasta
    // pelo teclado a partir do próprio elemento do slider.
    if (filtros.raioKm != null) {
      try {
        const slider = page.locator('[role="slider"]').first()
        await slider.focus()
        for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowLeft')
        const passos = Math.round(filtros.raioKm / 10)
        for (let i = 0; i < passos; i++) await page.keyboard.press('ArrowRight')
      } catch (err) {
        console.warn(`[filtros] não consegui ajustar o raio de distância: ${err.message}`)
      }
    }
  } else {
    if (filtros.estado) await selecionarComboBox(page, 'Selecionar estado', filtros.estado)
    if (filtros.cidade) await selecionarComboBox(page, 'Selecionar cidade', filtros.cidade)
  }

  if (filtros.portal) await selecionarComboBox(page, 'Pesquisar portal', filtros.portal)
  if (filtros.orgao) await selecionarComboBox(page, 'Pesquisar órgão', filtros.orgao)

  if (filtros.registroPreco === 'sim') await clicarCheckboxPeloLabel(page, 'Sim')
  if (filtros.registroPreco === 'nao') await clicarCheckboxPeloLabel(page, 'Não')

  for (const t of filtros.tipo || []) {
    await clicarCheckboxPeloLabel(page, t === 'material' ? 'Material' : 'Serviço')
  }

  await preencherTexto(page, 'Digite os termos que não quer como resultado', filtros.palavrasIndesejadas)
  await preencherTexto(page, 'Digite o código UASG do órgão', filtros.codigoUasg)
  await preencherTexto(page, 'Ex: 90001/2024', filtros.numeroCompra)

  // "Valor da compra total" vem antes de "Valor do item" na tela — os dois
  // pares de campo Min/Max repetem o mesmo placeholder, por isso o índice.
  await preencherMinMax(page, 0, filtros.valorCompraMin, filtros.valorCompraMax)
  await preencherMinMax(page, 1, filtros.valorItemMin, filtros.valorItemMax)

  if (filtros.modoDisputa) await selecionarComboBox(page, 'Selecionar modo', filtros.modoDisputa)
  if (filtros.esfera) {
    const label = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal' }[filtros.esfera]
    if (label) await selecionarComboBox(page, 'Selecionar esfera', label)
  }
}

module.exports = { aplicarFiltros }
