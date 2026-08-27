// Preenche o painel "Filtros de Pesquisa" do Licitei a partir de um
// LicitaiBuscaFiltros (ver src/types/domain.ts — mesmo formato salvo pela
// tela "Buscas Salvas" do ConectaGov). Cada campo é best-effort e isolado
// num try/catch próprio: se um seletor não bater (o Licitei pode reorganizar
// a tela), o robô avisa no log e segue preenchendo o resto, em vez de
// travar a busca inteira por causa de um único filtro.
//
// Timeout curto (6s) de propósito: o padrão do Playwright é 30s por ação,
// e com ~20 campos possíveis isso pode significar minutos inteiros
// desperdiçados esperando por campos que simplesmente não existem na tela
// (ex: página errada). Se o campo existe, 6s é mais que suficiente.
const TIMEOUT_CAMPO = 6000

// Cada helper devolve true/false (aplicou ou não) em vez de só logar —
// aplicarFiltros usa isso pra saber se ALGUM filtro pedido pelo usuário
// falhou de verdade, em vez de deixar a busca "concluir com sucesso"
// silenciosamente enquanto roda sem nenhum filtro (ou com só parte deles).
async function preencherTexto(page, placeholder, valor) {
  if (!valor) return true
  try {
    await page.getByPlaceholder(placeholder).first().fill(String(valor), { timeout: TIMEOUT_CAMPO })
    return true
  } catch (err) {
    console.warn(`[filtros] não consegui preencher "${placeholder}": ${err.message}`)
    return false
  }
}

async function selecionarComboBox(page, placeholder, valorTexto) {
  if (!valorTexto) return true
  try {
    await page.getByPlaceholder(placeholder).first().click({ timeout: TIMEOUT_CAMPO })
    await page.getByRole('option', { name: valorTexto, exact: false }).first().click({ timeout: TIMEOUT_CAMPO })
    return true
  } catch (err) {
    console.warn(`[filtros] não consegui selecionar "${valorTexto}" em "${placeholder}": ${err.message}`)
    return false
  }
}

async function clicarCheckboxPeloLabel(page, texto) {
  try {
    await page.getByText(texto, { exact: true }).first().click({ timeout: TIMEOUT_CAMPO })
    return true
  } catch (err) {
    console.warn(`[filtros] não consegui marcar o checkbox "${texto}": ${err.message}`)
    return false
  }
}

async function preencherMinMax(page, indice, min, max) {
  try {
    if (min != null) await page.getByPlaceholder('Min').nth(indice).fill(String(min), { timeout: TIMEOUT_CAMPO })
    if (max != null) await page.getByPlaceholder('Max').nth(indice).fill(String(max), { timeout: TIMEOUT_CAMPO })
    return true
  } catch (err) {
    console.warn(`[filtros] não consegui preencher valor min/max (índice ${indice}): ${err.message}`)
    return false
  }
}

// ATENÇÃO: tipoData/período, o slider de "Raio de distância" e modo de
// disputa/esfera ainda não foram testados contra a tela real do Licitei —
// os seletores abaixo são um primeiro palpite a partir dos prints
// recebidos. Prováveis pontos de ajuste depois da primeira rodada real
// (ver os logs "[filtros] não consegui..." no GitHub Actions).
//
// Devolve { tentados, falhas } — falhas é a lista (em português, pronta pra
// mostrar na UI) dos filtros que o USUÁRIO pediu (valor preenchido na busca
// salva) e que o robô não conseguiu aplicar na tela. Um filtro que o usuário
// nem pediu (valor vazio) nunca entra nem em tentados nem em falhas.
async function aplicarFiltros(page, filtros) {
  const falhas = []
  let tentados = 0
  const marcar = async (rotulo, valorPedido, promessa) => {
    if (!valorPedido) return
    tentados++
    const ok = await promessa
    if (!ok) falhas.push(rotulo)
  }

  await marcar('Palavra-chave', filtros.palavraChave, preencherTexto(page, 'Digite o que você quer vender hoje', filtros.palavraChave))

  await marcar('Modalidade', filtros.modalidade, filtros.modalidade ? selecionarComboBox(page, 'Selecionar modalidade', filtros.modalidade) : Promise.resolve(true))

  if (filtros.localizacaoModo === 'raio_distancia') {
    await marcar('Cidade', filtros.cidade, filtros.cidade ? selecionarComboBox(page, 'Selecionar cidade', filtros.cidade) : Promise.resolve(true))
    // Slider — não dá pra "clicar numa opção" como nos combobox; arrasta
    // pelo teclado a partir do próprio elemento do slider.
    if (filtros.raioKm != null) {
      tentados++
      try {
        const slider = page.locator('[role="slider"]').first()
        await slider.focus({ timeout: TIMEOUT_CAMPO })
        for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowLeft')
        const passos = Math.round(filtros.raioKm / 10)
        for (let i = 0; i < passos; i++) await page.keyboard.press('ArrowRight')
      } catch (err) {
        console.warn(`[filtros] não consegui ajustar o raio de distância: ${err.message}`)
        falhas.push('Raio de distância')
      }
    }
  } else {
    await marcar('Estado', filtros.estado, filtros.estado ? selecionarComboBox(page, 'Selecionar estado', filtros.estado) : Promise.resolve(true))
    await marcar('Cidade', filtros.cidade, filtros.cidade ? selecionarComboBox(page, 'Selecionar cidade', filtros.cidade) : Promise.resolve(true))
  }

  await marcar('Portal', filtros.portal, filtros.portal ? selecionarComboBox(page, 'Pesquisar portal', filtros.portal) : Promise.resolve(true))
  await marcar('Órgão', filtros.orgao, filtros.orgao ? selecionarComboBox(page, 'Pesquisar órgão', filtros.orgao) : Promise.resolve(true))

  if (filtros.registroPreco === 'sim') await marcar('Registro de Preço (Sim)', true, clicarCheckboxPeloLabel(page, 'Sim'))
  if (filtros.registroPreco === 'nao') await marcar('Registro de Preço (Não)', true, clicarCheckboxPeloLabel(page, 'Não'))

  for (const t of filtros.tipo || []) {
    const label = t === 'material' ? 'Material' : 'Serviço'
    await marcar(`Tipo: ${label}`, true, clicarCheckboxPeloLabel(page, label))
  }

  await marcar('Palavras indesejadas', filtros.palavrasIndesejadas, preencherTexto(page, 'Digite os termos que não quer como resultado', filtros.palavrasIndesejadas))
  await marcar('Código UASG', filtros.codigoUasg, preencherTexto(page, 'Digite o código UASG do órgão', filtros.codigoUasg))
  await marcar('Número da compra', filtros.numeroCompra, preencherTexto(page, 'Ex: 90001/2024', filtros.numeroCompra))

  // "Valor da compra total" vem antes de "Valor do item" na tela — os dois
  // pares de campo Min/Max repetem o mesmo placeholder, por isso o índice.
  if (filtros.valorCompraMin != null || filtros.valorCompraMax != null) {
    await marcar('Valor da compra', true, preencherMinMax(page, 0, filtros.valorCompraMin, filtros.valorCompraMax))
  }
  if (filtros.valorItemMin != null || filtros.valorItemMax != null) {
    await marcar('Valor do item', true, preencherMinMax(page, 1, filtros.valorItemMin, filtros.valorItemMax))
  }

  await marcar('Modo de disputa', filtros.modoDisputa, filtros.modoDisputa ? selecionarComboBox(page, 'Selecionar modo', filtros.modoDisputa) : Promise.resolve(true))
  if (filtros.esfera) {
    const label = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal' }[filtros.esfera]
    if (label) await marcar('Esfera', true, selecionarComboBox(page, 'Selecionar esfera', label))
  }

  return { tentados, falhas }
}

module.exports = { aplicarFiltros }
