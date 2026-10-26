// Prompt que o usuário cola no Claude/ChatGPT (junto com o PDF do edital)
// quando a IA do sistema (Gemini/Mistral, function Analisar-edital) falha —
// a resposta volta pro sistema pelo botão "Importar análise" (ver
// importarAnaliseExterna.ts). Ele parte do PROMPT de
// supabase/functions/Analisar-edital/index.ts com as mesmas regras por
// campo, mas acrescenta o que lá o schema estruturado do Gemini garante
// sozinho e aqui não: formato de datas/números, valores permitidos de
// modalidade/categoria, e o modelo do JSON com todas as chaves.
//
// Se algum campo vier torto num teste real com o Claude/ChatGPT, é só
// ajustar o texto abaixo — nada mais depende da redação.
import { CATEGORIAS_CHECKLIST, MODALIDADES_VALIDAS } from './analiseEdital'

// Mesmas chaves de ANALISE_SCHEMA (Analisar-edital/index.ts) — o
// importador descarta qualquer chave fora daqui.
const MODELO_RESPOSTA = {
  municipio: '',
  orgao: '',
  objeto: '',
  numeroEdital: '',
  numeroProcesso: '',
  modalidade: '',
  srp: false,
  data: 'DD/MM/AAAA',
  horario: 'HH:MM',
  portal: '',
  intervaloLances: '',
  modoDisputa: {
    tipo: '',
    duracaoFaseAberta: '',
    duracaoFaseFechada: '',
    prorrogacaoAutomatica: '',
    tempoAleatorio: '',
    criterioEncerramento: '',
    observacoes: '',
  },
  resumoTecnico: '',
  valorTotalEstimado: null,
  itens: [
    { numero: '', lote: '', descricao: '', unidade: '', quantidade: 0, valorReferencia: 0 },
  ],
  validadeProposta: '',
  catalogo: '',
  garantias: '',
  amostras: '',
  marcasPreAprovadas: '',
  habilitacao: {
    habilitacaoJuridica: '',
    regularidadeFiscalTrabalhista: '',
    qualificacaoEconomicoFinanceira: '',
    qualificacaoTecnica: '',
    proposta: '',
  },
  prazos: '',
  formaEntrega: '',
  localEntrega: '',
  condicoesPagamento: '',
  clausulasRestritivas: '',
  conclusaoTecnica: '',
  checklistDocumentacao: [
    { descricao: '', categoria: '', obrigatorio: true },
  ],
}

export const PROMPT_ANALISE_EXTERNA = `Responda SOMENTE com um único bloco JSON, sem nenhum texto antes ou depois. O edital (e o termo de referência, se houver) está em anexo.

Você é um analista de licitações públicas brasileiras, especialista na Lei nº 14.133/2021 e no Decreto nº 10.024/2019 (pregão eletrônico). Analise o edital (e o termo de referência, se estiver junto) em anexo e devolva um JSON exatamente no formato do MODELO DA RESPOSTA, no fim desta mensagem.

Preencha todos os campos que conseguir identificar no documento; deixe null ou vazio o que não encontrar — nunca invente informação.

IMPORTANTE: quando a mesma informação aparecer repetida em várias partes do edital (isso é comum — o mesmo prazo ou regra costuma aparecer no resumo, no modelo de proposta e nas condições gerais, cada vez com uma frase um pouco diferente), responda UMA ÚNICA VEZ, de forma direta e resumida — nunca liste cada variação de texto que encontrar. Ex: se o edital disser "90 dias" em três lugares com frases diferentes, o campo deve conter só "90 dias, contados da abertura da sessão", nunca as três frases juntas.

FORMATO DOS CAMPOS:
- "data": data da sessão pública no formato DD/MM/AAAA (ex: "15/03/2026"); "horario": no formato HH:MM (ex: "09:00").
- Números ("valorTotalEstimado", "quantidade", "valorReferencia") como número JSON, com ponto decimal e sem "R$" nem pontos de milhar — ex: 1234567.89, nunca "R$ 1.234.567,89".
- "modalidade": exatamente uma destas opções: ${MODALIDADES_VALIDAS.map((m) => `"${m}"`).join(', ')}.
- "srp": true se for Sistema de Registro de Preços, false se não for.
- "categoria" de cada item de "checklistDocumentacao": exatamente uma destas opções: ${CATEGORIAS_CHECKLIST.map((c) => `"${c}"`).join(', ')}.

Para "objeto", transcreva (resumindo só o essencial, sem cortar o sentido) a cláusula "Do Objeto" do edital — a frase formal que descreve o que está sendo licitado, tipo "Contratação de empresa especializada para fornecimento de...". Não confunda com "resumoTecnico", que é uma análise, não uma transcrição.

Para "numeroEdital", extraia o número de identificação do edital tal como escrito no documento (ex: "05/2026", "Edital nº 012/2026").

Para "numeroProcesso", extraia o número do processo administrativo/licitatório associado, se o edital mencionar (ex: "Processo nº 423/2026", "Processo Administrativo 1234/2026").

Para "intervaloLances", procure a cláusula do edital que define o intervalo/diferença MÍNIMA exigida entre um lance e o lance anterior durante a disputa (geralmente na seção sobre "modo de disputa", "lances" ou "fase de lances" do pregão eletrônico). Transcreva a regra tal como o edital define, incluindo a unidade (percentual ou valor fixo) — ex: "1% (um por cento)", "0,5%", "R$ 50,00". Se o edital definir regras diferentes pra fases diferentes (ex: lances abertos x fechados), traga a regra da fase de lances abertos/aberta, que é a que vale durante a disputa ao vivo. Se não encontrar essa cláusula, deixe null — não invente um percentual.

Para "modoDisputa", localize a cláusula do edital que define o MODO DE DISPUTA da sessão pública (geralmente na seção "Do Modo de Disputa", "Da Sessão Pública" ou "Dos Lances") e preencha, como um analista de licitações preencheria uma ficha de acompanhamento de sessão:
- tipo: "Aberto", "Fechado" ou "Aberto e Fechado", exatamente como o edital classificar;
- duracaoFaseAberta: a duração da fase de lances abertos, se houver — inclua tanto o tempo fixo quanto a regra de encerramento por inatividade, se o edital definir as duas coisas (ex: "15 minutos, encerrando automaticamente após 10 minutos sem novo lance");
- duracaoFaseFechada: a duração/regra da fase fechada, se houver (ex: "10 minutos para envio da proposta final lacrada", "os 3 melhores classificados têm até 5 minutos para ofertar nova proposta");
- prorrogacaoAutomatica: a regra de prorrogação automática da fase aberta, se o edital previr (ex: "prorroga automaticamente por mais 2 minutos a cada novo lance registrado nos 2 minutos finais");
- tempoAleatorio: se o edital previr um tempo aleatório de encerramento decidido pelo sistema (comum no modo aberto, tipicamente de até 30 minutos), descreva a regra tal como escrita;
- criterioEncerramento: resuma, em poucas palavras, o que efetivamente encerra a disputa (ex: "inatividade + tempo aleatório do sistema", "decisão do pregoeiro", "prazo fixo sem prorrogação");
- observacoes: qualquer outra regra relevante da disputa que não caiba nos campos acima (ex: regra específica de desempate na fase de lances, retorno à fase de lances em caso de desclassificação, particularidades do modo combinado).
Preencha só o que o próprio edital detalhar explicitamente — nunca complete uma regra com o que é "padrão" ou "comum" no mercado se o documento não disser isso.

Para "valorTotalEstimado", extraia o valor total estimado/máximo da licitação exatamente como declarado no próprio edital (geralmente numa cláusula do tipo "Do Valor Estimado" ou no preâmbulo, ex: "R$ 1.234.567,89" vira 1234567.89). Traga o número tal como o edital afirma — NUNCA calcule somando os valores dos itens, mesmo que pareça dar no mesmo; se o edital não declarar esse valor total explicitamente, deixe null.

Para "itens", liste TODOS os itens do edital, na ordem em que aparecem, com o valor de referência UNITÁRIO em "valorReferencia".

Se a licitação for organizada em LOTES (grupos de itens que devem ser disputados/adjudicados em conjunto), preencha o campo "lote" de cada item com o número/identificação do lote ao qual ele pertence, exatamente como o edital o identifica (ex: "1", "Lote 01", "Lote II"). Se a licitação for por item individual (sem lotes), deixe "lote" vazio em todos os itens.

ATENÇÃO ESPECIAL com unidades que têm expoente (m², m³, cm³, km² etc.) nos itens: releia a quantidade e a unidade completas com cuidado antes de preencher — o caractere de expoente (², ³) não pode cortar ou confundir o número nem a unidade ao lado dele. Exemplo: "405 m³" tem que virar quantidade 405 e unidade "m³" — nunca quantidade 4 e unidade "m", nem qualquer outra combinação truncada.

Para "checklistDocumentacao", liste TODOS os documentos de habilitação exigidos no edital (jurídica, fiscal/trabalhista, econômico-financeira, técnica), um item por documento, marcando "obrigatorio": true para os exigidos e "obrigatorio": false só se o próprio edital disser que é facultativo/complementar. SEMPRE que o próprio edital numerar aquele documento (cláusula, item ou alínea, ex: "5.2", "5.2.1", "5 a)", "8.3 b)"), inicie o campo "descricao" com esse número/alínea EXATAMENTE como aparece no edital, seguido de um espaço e então o nome do documento — ex: "5.2 a) Comprovação de inscrição no CNPJ", "8.3 Certidão Negativa de Débitos Trabalhistas (CNDT)". Se o edital não numerar aquele item especificamente, escreva só a descrição, sem inventar numeração.

Para os 5 campos de "habilitacao", resuma em texto corrido o que o edital exige em cada categoria (habilitação jurídica, regularidade fiscal e trabalhista, qualificação econômico-financeira, qualificação técnica, proposta).

SE FOR LONGO DEMAIS: se a lista de itens não couber inteira numa resposta, pare no último item COMPLETO, feche o JSON corretamente e escreva, depois do bloco, só a linha "CONTINUA NO ITEM N" (N = número do próximo item). Quando eu responder "continue", devolva um NOVO bloco JSON contendo só a chave "itens" com os itens restantes (e "checklistDocumentacao", se ela também tiver ficado de fora) — sem repetir os campos já enviados.

MODELO DA RESPOSTA (mesmas chaves, nesta estrutura):
${JSON.stringify(MODELO_RESPOSTA, null, 2)}`
