import { useEffect, useMemo, useRef, useState } from 'react'
import { FileSignature, Copy, Printer, Lock, Pencil, Check, RotateCcw, AlertTriangle } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Field, Input, Select, Textarea, Button } from '../components/ui/FormControls'
import DocumentUploader from '../components/ui/DocumentUploader'
import ErrorAlert from '../components/ui/ErrorAlert'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useClients } from '../hooks/useClients'
import { useBiddings } from '../hooks/useBiddings'
import { useContracts, calcContratoTermino } from '../hooks/useContracts'
import { useEmpresaPerfil } from '../hooks/useEmpresaPerfil'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { formatBRL } from '../hooks/useAccountBalances'
import { todayLocalISO } from '../lib/dateUtils'
import type { Client, Bidding, EmpresaPerfil, ContractTipo } from '../types/domain'

const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function formatarDataExtenso(iso: string | null): string {
  if (!iso) return '[data não informada]'
  const [ano, mes, dia] = iso.split('-').map(Number)
  return `${dia} de ${MESES_EXTENSO[mes - 1]} de ${ano}`
}

function formatarDataBr(iso: string | null): string {
  if (!iso) return '[data não informada]'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

// Escapa antes de interpolar no HTML do documento — o texto vem de campos
// de cadastro (nome de cliente, endereço etc.), nunca deveria conter HTML,
// mas evita que um "<" digitado por acaso quebre o documento renderizado.
function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const NAO_INFORMADO = '<span style="color:#b03a3a;">[não informado]</span>'
function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return NAO_INFORMADO
  return esc(v)
}

// Qualificação de uma pessoa física (responsável do cliente, ou o
// representante da própria contratada) — mesmo formato nos dois modelos:
// "brasileiro(a), {estado civil}, inscrito no CPF sob nº {cpf}, residente
// e domiciliado em {endereço}". Nacionalidade é sempre "brasileiro(a)" —
// não existe campo próprio pra isso hoje (caso raríssimo de sócio
// estrangeiro pode ser ajustado direto no documento editável).
function qualificacaoPessoa(nome: string | null, cpf: string | null, estadoCivil: string | null, endereco: string | null): string {
  return `${campo(nome)}, brasileiro(a), ${estadoCivil ? esc(estadoCivil.toLowerCase()) : NAO_INFORMADO}, inscrito(a) no CPF sob nº ${campo(cpf)}, residente e domiciliado(a) em ${campo(endereco)}`
}

function blocoIdentificacao(client: Client, perfil: EmpresaPerfil | null): string {
  return `
    <p class="sec">1. IDENTIFICAÇÃO DAS PARTES CONTRATANTES:</p>
    <p><b>CONTRATANTE:</b> ${campo(client.name)}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${campo(client.cnpj)}, com sede em ${campo(client.address)}${client.cep ? `, CEP ${esc(client.cep)}` : ''}, neste ato representada por seu sócio-administrador, ${qualificacaoPessoa(client.responsavelNome, client.responsavelCpf, client.estadoCivil, client.responsavelEndereco)}.</p>
    <p><b>CONTRATADA:</b> CONECTAGOV REPRESENTAÇÕES, pessoa jurídica de direito privado, inscrita no CNPJ sob nº 48.153.601/0001-60, com sede na Rua Dona Laura, nº 57, Centro, em Vacaria/RS, neste ato representada por seu sócio-administrador, ${qualificacaoPessoa(perfil?.representanteNome ?? null, perfil?.representanteCpf ?? null, perfil?.representanteEstadoCivil ?? null, perfil?.representanteEndereco ?? null)}.</p>
    <p>As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Assessoria e Representação, que se regerá pelas cláusulas descritas neste instrumento.</p>
  `
}

function blocoDadosBancarios(perfil: EmpresaPerfil | null): string {
  return `
    <p><span class="cl-num">CLÁUSULA 3.2.</span> O pagamento deverá ser feito mediante dinheiro, depósito, transferência ou pix para conta bancária a ser indicada pela contratada.</p>
    <p>Titularidade: ${campo(perfil?.razaoSocial ?? 'ConectaGov Representações Ltda')}<br>
    Agência ${campo(perfil?.bancoAgencia)} - ${campo(perfil?.bancoNome)}<br>
    Conta ${campo(perfil?.bancoConta)}<br>
    Chave Pix ${campo(perfil?.chavePix)}</p>
  `
}

function blocoAssinatura(comarcaForo: string, dataAssinatura: string | null): string {
  return `
    <p>E como prova de assim haverem livremente pactuado, firmam o presente instrumento em duas vias de igual teor e forma, juntamente com as testemunhas instrumentais.</p>
    <p class="assin">${campo(comarcaForo)}, ${formatarDataExtenso(dataAssinatura)}.</p>
    <div class="lin"><span>_______________________<br>CONTRATADA</span><span>_______________________<br>CONTRATANTE</span></div>
    <p style="margin-top:22px;">Testemunhas:</p>
    <div class="lin"><span>_______________________<br>Nome:<br>CPF:</span><span>_______________________<br>Nome:<br>CPF:</span></div>
  `
}

export type ContratoParams = {
  tipo: ContractTipo
  client: Client
  perfil: EmpresaPerfil | null
  bidding: Bidding | null
  valor: number
  comissao: number
  diaVencimento: number
  dataInicio: string
  vigenciaMeses: number
  dataInicioPagamento: string
  dataAssinatura: string
  comarcaForo: string
  clausulaAdicional: string
}

function renderContratoMensalista(p: ContratoParams): string {
  const termino = calcContratoTermino({ dataInicio: p.dataInicio, vigenciaMeses: p.vigenciaMeses })
  return `
    <div class="logo-wrap"><img src="/logo-contrato.jpg" alt="ConectaGov"></div>
    <p class="titulo">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE<br>CONSULTORIA E INTERMEDIAÇÃO ESTRATÉGICA</p>
    ${blocoIdentificacao(p.client, p.perfil)}
    <p class="sec">2. DO OBJETO:</p>
    <p><span class="cl-num">CLÁUSULA 2.1.</span> O objeto do presente contrato consiste na prestação de serviços de assessoria, consultoria e intermediação estratégica em licitações e contratações diretas junto ao Poder Público, nas quais a contratada atuará na defesa dos interesses da contratante, visando sua participação em certames e processos de contratação que envolvam os seguintes objetos, conforme contrato social da contratante:</p>
    <p><span class="cl-num">CLÁUSULA 2.2.</span> Para o cumprimento do estipulado na cláusula 2.1, serão consideradas as seguintes atividades, de forma não cumulativa, a depender da necessidade, avaliação e estratégia adotadas pela contratada no exercício da consultoria e intermediação:</p>
    <p>a) Captação e análise de oportunidades;<br>
    b) Organização e gestão documental;<br>
    c) Acompanhamento de licitações, em todas as fases;<br>
    d) Recursos e impugnações;<br>
    e) Atuação preventiva e estratégica;<br>
    f) Acompanhamento estratégico da fase de execução contratual, limitado à orientação administrativa e documental, não assumindo a contratada qualquer responsabilidade técnica, operacional ou financeira decorrente da execução do contrato administrativo;<br>
    g) Elaboração de pedidos de revisão e reequilíbrio econômico-financeiro;<br>
    h) Judicialização, quando necessária, mediante contratação específica de advogado regularmente inscrito na OAB, a ser constituído pela contratante.</p>
    <p class="sec">3. DO VALOR E VIGÊNCIA CONTRATUAL:</p>
    <p><span class="cl-num">CLÁUSULA 3.1.</span> Obriga-se a contratante a pagar à contratada pela prestação de serviços de assessoria/consultoria em licitações e compras públicas os seguintes valores: ${esc(formatBRL(p.valor))} mensais, com vencimento no dia ${esc(p.diaVencimento)} de cada mês, em parcelas iguais e consecutivas, a contar de ${formatarDataBr(p.dataInicioPagamento)}; em caso de efetiva contratação com o poder público, obriga-se a contratante a pagar à contratada o valor equivalente a ${esc(p.comissao)}% (por cento) do valor efetivamente empenhado para a contratante, incluindo aditivos, reajustes, reequilíbrios econômico-financeiros e prorrogações contratuais, em até 35 (trinta e cinco) dias da data do empenho, nos procedimentos em que a contratada tenha atuado como intermediária da contratante, independentemente do prazo de vigência do presente instrumento.</p>
    ${blocoDadosBancarios(p.perfil)}
    <p><span class="cl-num">CLÁUSULA 3.3.</span> O presente instrumento possuirá vigência de ${esc(p.vigenciaMeses)} meses, com início em ${formatarDataBr(p.dataInicio)} e término em ${formatarDataBr(termino)}, podendo ser renovado mediante celebração de termo aditivo entre as partes.</p>
    <p><span class="cl-num">CLÁUSULA 3.4.</span> Em caso de atraso no pagamento, incidirão juros de mora de 1% (um por cento) ao mês e correção monetária pelo índice IPCA-E a contar da data do inadimplemento, sendo que em caso de atraso superior a 10 (dez) dias, a parte inadimplente será notificada para regularização no prazo de 5 (cinco) dias úteis, sob pena de rescisão contratual por justa causa, sem prejuízo da multa prevista neste contrato.</p>
    <p><span class="cl-num">CLÁUSULA 3.5.</span> Em caso de rescisão motivada pelo inadimplemento contratual fica estipulada multa equivalente a 10% sobre o valor das parcelas vincendas relativas à mensalidade contratual, sem prejuízo das comissões eventualmente já constituídas.</p>
    <p><span class="cl-num">CLÁUSULA 3.6.</span> Em caso de rescisão imotivada, fica obrigada a parte interessada na rescisão a comunicar a outra com antecedência de 30 (trinta) dias, sob pena de multa equivalente a ${esc(formatBRL(p.valor))}, sem prejuízo do pagamento proporcional inerente ao último mês de prestação de serviços eventualmente pendente de pagamento.</p>
    <p class="sec">4. DA CONFIDENCIALIDADE:</p>
    <p><span class="cl-num">CLÁUSULA 4.1.</span> As partes obrigam-se a manter sigilo absoluto sobre todas as informações, dados, documentos, estratégias, propostas comerciais, planilhas, valores, documentos técnicos, jurídicos ou administrativos, bem como quaisquer outras informações a que tenham acesso em razão da execução do presente contrato, não podendo divulgá-las a terceiros sem autorização prévia e expressa da outra parte.</p>
    <p><span class="cl-num">CLÁUSULA 4.2.</span> Não serão consideradas confidenciais as informações que sejam de domínio público; tenham sido obtidas legitimamente por terceiros; devam ser divulgadas por força de lei ou ordem judicial, hipótese em que a parte obrigada deverá comunicar previamente a outra, quando possível.</p>
    <p><span class="cl-num">CLÁUSULA 4.3.</span> A obrigação de confidencialidade permanecerá válida durante a vigência do contrato e pelo prazo de 5 (cinco) anos após seu encerramento, independentemente do motivo da rescisão.</p>
    <p class="sec">5. DAS DISPOSIÇÕES GERAIS:</p>
    <p><span class="cl-num">CLÁUSULA 5.1.</span> Incumbirá à contratante fornecer os meios e recursos necessários à execução do objeto contratual pela contratada, mantendo em dia suas obrigações com a Fazenda Pública, bem como todas as condições de habilitação regularmente exigidas para contratação com o poder público, na forma da Lei nº 14.133/2021.</p>
    <p><span class="cl-num">CLÁUSULA 5.2.</span> O presente contrato possui natureza exclusivamente civil e empresarial, inexistindo entre as partes qualquer vínculo empregatício, societário, associativo ou de representação comercial regida por legislação específica.</p>
    <p><span class="cl-num">CLÁUSULA 5.3.</span> O presente instrumento concede à contratante o direito de preferência na participação de licitações que tenham como objeto o fornecimento de serviços e equipamentos indicados na cláusula 2.1, de modo que somente no caso de haver a sua recusa ou desinteresse na participação da licitação sugerida pela contratada, na forma da cláusula 5.5., estará esta livre para a representação de outro fornecedor no respectivo certame.</p>
    <p><span class="cl-num">CLÁUSULA 5.4.</span> A contratada obriga-se a empregar seus melhores esforços técnicos e estratégicos na execução do objeto contratual, caracterizando-se a presente contratação como obrigação de meio e não de resultado, não garantindo, portanto, resultado específico, êxito em certames licitatórios ou celebração de contratos com o Poder Público, uma vez que tais eventos dependem de fatores alheios à sua atuação.</p>
    <p><span class="cl-num">CLÁUSULA 5.5.</span> Na captação de oportunidades, a contratante será informada, por qualquer meio, da data prevista para a realização de licitação inerente ao objeto de sua atividade, a fim de que possa fornecer toda a documentação necessária para a sua participação e oferta de lances, a qual deverá ser remetida à contratada em até 5 (cinco) dias antes da realização do certame. O não envio dos documentos, a recusa ou o silêncio da contratante no prazo assinalado será entendido como desinteresse na participação da licitação, eximindo a contratada de qualquer responsabilidade, bem como autorizando esta a representar outra empresa no respectivo certame.</p>
    <p><span class="cl-num">CLÁUSULA 5.6.</span> A responsabilidade da contratada limita-se aos serviços expressamente previstos neste contrato, não respondendo por:</p>
    <p>a) informações incorretas, incompletas ou intempestivas fornecidas pela contratante;<br>
    b) indeferimentos, inabilitações ou desclassificações decorrentes de falhas técnicas ou operacionais da contratante;<br>
    c) atos administrativos praticados pelo Poder Público.</p>
    <p><span class="cl-num">CLÁUSULA 5.7.</span> Eventuais despesas com viagem para atender os interesses da contratante, correrão por conta desta, mediante autorização prévia por escrito e reembolso no prazo de até 5 (cinco) dias úteis após apresentação das respectivas notas fiscais/recibos.</p>
    <p><span class="cl-num">CLÁUSULA 5.8.</span> Caso a contratante atue com dolo ou culpa grave que inviabilize a continuidade da prestação dos serviços, poderá a contratada rescindir o contrato por justa causa, fazendo jus ao recebimento:</p>
    <p>a) das parcelas vencidas e não pagas;<br>
    b) das comissões já constituídas até a data da rescisão;<br>
    c) da multa prevista na cláusula 3.4, quando aplicável.</p>
    <p class="sec">6. DO FORO:</p>
    <p><span class="cl-num">CLÁUSULA 6.1.</span> Elegem as partes, com a finalidade de dirimir dúvidas ou questionamentos que tenham origem no presente contrato e que não possam ser resolvidas amigavelmente, o foro da Comarca de ${campo(p.comarcaForo)}, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
    ${p.clausulaAdicional ? `<p class="sec">CLÁUSULA ADICIONAL:</p><p>${esc(p.clausulaAdicional)}</p>` : ''}
    ${blocoAssinatura(p.comarcaForo, p.dataAssinatura)}
  `
}

function renderContratoIndividual(p: ContratoParams): string {
  const b = p.bidding
  return `
    <div class="logo-wrap"><img src="/logo-contrato.jpg" alt="ConectaGov"></div>
    <p class="titulo">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE<br>INTERMEDIAÇÃO ESTRATÉGICA</p>
    ${blocoIdentificacao(p.client, p.perfil)}
    <p class="sec">2. DO OBJETO:</p>
    <p><span class="cl-num">CLÁUSULA 2.1.</span> O objeto do presente contrato consiste na prestação de serviços de intermediação estratégica na licitação que está programada para o dia ${b ? formatarDataBr(b.dataAbertura) : NAO_INFORMADO}, junto ao ${b ? `Município de ${campo(b.municipio ?? b.orgao)}` : NAO_INFORMADO}${b?.numeroEdital ? `, conforme Edital ${esc(b.numeroEdital)}` : ''}.</p>
    <p><span class="cl-num">CLÁUSULA 2.2.</span> Para o cumprimento do estipulado na cláusula 2.1, serão consideradas as seguintes atividades, de forma não cumulativa, a depender da necessidade, no exercício da intermediação:</p>
    <p>a) Organização e gestão documental;<br>
    b) Acompanhamento da licitação indicada, em todas as fases;<br>
    c) Recursos e impugnações;<br>
    d) Acompanhamento estratégico da fase de execução contratual, limitado à orientação administrativa e documental, não assumindo a contratada qualquer responsabilidade técnica, operacional ou financeira decorrente da execução do contrato administrativo;<br>
    e) Elaboração de pedidos de revisão e reequilíbrio econômico-financeiro;</p>
    <p class="sec">3. DO VALOR:</p>
    <p><span class="cl-num">CLÁUSULA 3.1.</span> Obriga-se a contratante a pagar à contratada o valor de ${esc(formatBRL(p.valor))}, à vista, na data da assinatura do presente instrumento. Ainda, em caso de efetiva contratação com o poder público, obriga-se a contratante a pagar à contratada o valor equivalente a ${esc(p.comissao)}% (por cento) do valor efetivamente empenhado para a contratante, incluindo aditivos, reajustes, reequilíbrios econômico-financeiros e prorrogações contratuais, em até 35 (trinta e cinco) dias da data de cada empenho, até o completo encerramento da relação obrigacional entre a contratante e o poder público, o qual será determinado como vencimento.</p>
    ${blocoDadosBancarios(p.perfil)}
    <p><span class="cl-num">CLÁUSULA 3.3.</span> Em caso de atraso no pagamento, incidirão juros de mora de 1% (um por cento) ao mês e correção monetária pelo índice IPCA-E a contar da data do inadimplemento, sendo que em caso de atraso superior a 10 (dez) dias, a parte inadimplente será notificada para regularização no prazo de 5 (cinco) dias úteis, sob pena de rescisão contratual por justa causa, sem prejuízo da multa prevista neste contrato e dos valores previstos na cláusula 3.1.</p>
    <p><span class="cl-num">CLÁUSULA 3.4.</span> Em caso de rescisão motivada pelo inadimplemento contratual fica estipulada multa equivalente a 10% sobre o valor das parcelas vencidas e vincendas inerentes em relação às parcelas previstas na cláusula 3.1, decorrentes da pactuação em percentual.</p>
    <p class="sec">4. DA CONFIDENCIALIDADE:</p>
    <p><span class="cl-num">CLÁUSULA 4.1.</span> As partes obrigam-se a manter sigilo absoluto sobre todas as informações, dados, documentos, estratégias, propostas comerciais, planilhas, valores, documentos técnicos, jurídicos ou administrativos, bem como quaisquer outras informações a que tenham acesso em razão da execução do presente contrato, não podendo divulgá-las a terceiros sem autorização prévia e expressa da outra parte.</p>
    <p><span class="cl-num">CLÁUSULA 4.2.</span> Não serão consideradas confidenciais as informações que sejam de domínio público; tenham sido obtidas legitimamente por terceiros; devam ser divulgadas por força de lei ou ordem judicial, hipótese em que a parte obrigada deverá comunicar previamente a outra, quando possível.</p>
    <p><span class="cl-num">CLÁUSULA 4.3.</span> A obrigação de confidencialidade permanecerá válida pelo prazo de 5 (cinco) anos.</p>
    <p class="sec">5. DAS DISPOSIÇÕES GERAIS:</p>
    <p><span class="cl-num">CLÁUSULA 5.1.</span> Incumbirá à contratante fornecer os meios e recursos necessários à execução do objeto contratual pela contratada, mantendo em dia suas obrigações com a Fazenda Pública, bem como todas as condições de habilitação regularmente exigidas para contratação com o poder público, na forma da Lei nº 14.133/2021.</p>
    <p><span class="cl-num">CLÁUSULA 5.2.</span> O presente contrato possui natureza exclusivamente civil e empresarial, inexistindo entre as partes qualquer vínculo empregatício, societário, associativo ou de representação comercial regida por legislação específica.</p>
    <p><span class="cl-num">CLÁUSULA 5.3.</span> A contratada obriga-se a empregar seus melhores esforços técnicos e estratégicos na execução do objeto contratual, caracterizando-se a presente contratação como obrigação de meio e não de resultado, não garantindo, portanto, resultado específico, êxito no certame ou celebração de contrato com o Poder Público, uma vez que tais eventos dependem de fatores alheios à sua atuação.</p>
    <p><span class="cl-num">CLÁUSULA 5.4.</span> A contratante deverá fornecer toda a documentação necessária para a sua participação e oferta de lances, a qual deverá ser remetida à contratada em até 5 (cinco) dias antes da realização do certame. O não envio dos documentos, a recusa ou o silêncio da contratante no prazo assinalado será entendido como desinteresse na participação da licitação, eximindo a contratada de qualquer responsabilidade, bem como autorizando esta a representar outra empresa no respectivo certame.</p>
    <p><span class="cl-num">CLÁUSULA 5.5.</span> A ocorrência do disposto na cláusula 5.4., não ensejará a devolução do valor inicial pago à contratada.</p>
    <p><span class="cl-num">CLÁUSULA 5.6.</span> A responsabilidade da contratada limita-se aos serviços expressamente previstos neste contrato, não respondendo por:</p>
    <p>a) informações incorretas, incompletas ou intempestivas fornecidas pela contratante;<br>
    b) indeferimentos, inabilitações ou desclassificações decorrentes de falhas técnicas ou operacionais da contratante;<br>
    c) atos administrativos praticados pelo Poder Público.</p>
    <p><span class="cl-num">CLÁUSULA 5.7.</span> Eventuais despesas com viagem para atender os interesses da contratante, correrão por conta desta, mediante autorização prévia por escrito e reembolso no prazo de até 5 (cinco) dias úteis após apresentação das respectivas notas fiscais/recibos.</p>
    <p><span class="cl-num">CLÁUSULA 5.8.</span> Caso a contratante atue com dolo ou culpa grave que inviabilize a continuidade da prestação dos serviços, poderá a contratada rescindir o contrato por justa causa, fazendo jus ao recebimento:</p>
    <p>a) das parcelas vencidas e não pagas;<br>
    b) das comissões já constituídas até a data da rescisão;<br>
    c) da multa prevista na cláusula 3.4, quando aplicável.</p>
    <p class="sec">6. DO FORO:</p>
    <p><span class="cl-num">CLÁUSULA 6.1.</span> Elegem as partes, com a finalidade de dirimir dúvidas ou questionamentos que tenham origem no presente contrato e que não possam ser resolvidas amigavelmente, o foro da Comarca de ${campo(p.comarcaForo)}, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
    ${p.clausulaAdicional ? `<p class="sec">CLÁUSULA ADICIONAL:</p><p>${esc(p.clausulaAdicional)}</p>` : ''}
    ${blocoAssinatura(p.comarcaForo, p.dataAssinatura)}
  `
}

function renderContrato(p: ContratoParams): string {
  return p.tipo === 'individual' ? renderContratoIndividual(p) : renderContratoMensalista(p)
}

export default function ContratosPage() {
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const { contracts, addContract } = useContracts()
  const { perfil } = useEmpresaPerfil()
  const { nivel: nivelAcesso, carregando: carregandoPermissao } = usePermissaoFerramenta('contratos')
  const podeEditar = nivelAcesso === 'edicao' && !carregandoPermissao

  const [clientId, setClientId] = useState('')
  const [tipo, setTipo] = useState<ContractTipo>('mensalista')
  const [biddingId, setBiddingId] = useState('')
  const [valor, setValor] = useState(0)
  const [comissao, setComissao] = useState(2)
  const [diaVencimento, setDiaVencimento] = useState(10)
  const [dataInicio, setDataInicio] = useState(todayLocalISO())
  const [vigenciaMeses, setVigenciaMeses] = useState(6)
  const [dataInicioPagamento, setDataInicioPagamento] = useState(todayLocalISO())
  const [dataAssinatura, setDataAssinatura] = useState(todayLocalISO())
  const [comarcaForo, setComarcaForo] = useState('')
  const [clausulaAdicional, setClausulaAdicional] = useState('')

  const [modoEdicao, setModoEdicao] = useState(false)
  const [editadoManualmente, setEditadoManualmente] = useState(false)
  const [confirmRegenerarAberto, setConfirmRegenerarAberto] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)

  const client = clients.find((c) => c.id === clientId) ?? null
  const clientBiddings = biddings.filter((b) => b.clientId === clientId)
  const bidding = biddings.find((b) => b.id === biddingId) ?? null

  // Ao trocar de cliente: se ele já é Mensalista, pré-preenche os campos
  // com os mesmos dados que já geram as parcelas de "Mensalidade
  // Assessoria" em Contas & Lançamentos — pra este contrato descrever
  // exatamente o que já está sendo cobrado, sem redigitar nada. Mudar os
  // campos aqui depois NÃO altera o Cadastro do Cliente nem as
  // mensalidades já geradas — é só pra esta minuta.
  useEffect(() => {
    if (!clientId) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setEditadoManualmente(false)
    setModoEdicao(false)
    if (client?.isMensalista) {
      setTipo('mensalista')
      setValor(client.valorMensalidade ?? 0)
      setDiaVencimento(client.diaVencimento ?? 10)
      setDataInicio(client.dataInicioContrato ?? todayLocalISO())
      setDataInicioPagamento(client.dataInicioPagamento ?? client.dataInicioContrato ?? todayLocalISO())
      setVigenciaMeses(client.periodoMeses ?? 6)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Aplica o padrão do Perfil da Empresa só enquanto o campo ainda não foi
  // tocado (guarda !comarcaForo evita sobrescrever o que o usuário digitou).
  useEffect(() => {
    if (!comarcaForo && perfil?.comarcaForoPadrao) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setComarcaForo(perfil.comarcaForoPadrao)
    }
  }, [perfil?.comarcaForoPadrao, comarcaForo])

  const params: ContratoParams | null = useMemo(() => {
    if (!client) return null
    return {
      tipo, client, perfil, bidding,
      valor, comissao, diaVencimento, dataInicio, vigenciaMeses, dataInicioPagamento,
      dataAssinatura, comarcaForo, clausulaAdicional,
    }
  }, [
    tipo, client, perfil, bidding, valor, comissao, diaVencimento, dataInicio,
    vigenciaMeses, dataInicioPagamento, dataAssinatura, comarcaForo, clausulaAdicional,
  ])

  const regenerarDocumento = () => {
    if (!docRef.current || !params) return
    docRef.current.innerHTML = renderContrato(params)
    setEditadoManualmente(false)
    setModoEdicao(false)
  }

  // Regenera automaticamente enquanto o usuário não tiver editado o texto
  // na mão — depois disso, mudar um parâmetro não sobrescreve mais
  // sozinho (evita perder o ajuste manual sem querer); o aviso/confirmação
  // só aparece quando o usuário clicar em "Regenerar do modelo".
  useEffect(() => {
    if (!editadoManualmente) regenerarDocumento()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const solicitarRegenerar = () => {
    if (editadoManualmente) setConfirmRegenerarAberto(true)
    else regenerarDocumento()
  }

  const termino = tipo === 'mensalista' ? calcContratoTermino({ dataInicio, vigenciaMeses }) : null

  const handleSave = () => {
    if (!client || !docRef.current) return
    addContract.mutate({
      clientId: client.id,
      biddingId: tipo === 'individual' ? (biddingId || null) : null,
      tipo,
      retentorFixoMensal: valor,
      comissaoExito: comissao,
      comarcaForo,
      clausulaAdicional: clausulaAdicional || null,
      conteudoGerado: docRef.current.innerText,
      dataAssinatura,
      dataInicio: tipo === 'mensalista' ? dataInicio : null,
      vigenciaMeses: tipo === 'mensalista' ? vigenciaMeses : null,
      status: 'ativo',
    })
  }

  const copyText = () => {
    if (docRef.current) navigator.clipboard.writeText(docRef.current.innerText)
  }

  return (
    <div className="pb-10">
      <PageHeader title="Módulo de Contratos" subtitle="Gere contratos jurídicos de prestação de serviços com preenchimento automático" icon={FileSignature} />

      {!podeEditar && (
        <div className="px-6 mt-4 flex justify-end">
          <span className="text-[12px] font-semibold text-base-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Somente visualização
          </span>
        </div>
      )}

      <div className="px-6 mt-4 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-base-100 mb-4">Parâmetros de Adesão</h3>
          <div className="flex flex-col gap-4">
            <Field label="1. Tipo de Contrato" required>
              <div className="flex bg-base-850 border border-base-700 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => { setTipo('mensalista'); setEditadoManualmente(false); setModoEdicao(false) }}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition ${tipo === 'mensalista' ? 'bg-accent-500/20 text-accent-300' : 'text-base-400'}`}
                >
                  Mensalista
                </button>
                <button
                  type="button"
                  onClick={() => { setTipo('individual'); setEditadoManualmente(false); setModoEdicao(false) }}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition ${tipo === 'individual' ? 'bg-accent-500/20 text-accent-300' : 'text-base-400'}`}
                >
                  Individual (licitação)
                </button>
              </div>
            </Field>

            <Field label="2. Cliente Contratante" required>
              <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setBiddingId('') }}>
                <option value="">Selecione o cliente...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            {client && (
              <p className="text-[11px] text-base-500 -mt-2">
                CNPJ, endereço e responsável são puxados automaticamente do Cadastro de Clientes.
              </p>
            )}

            {tipo === 'individual' && (
              <Field label="3. Vincular a uma Licitação" required>
                <Select value={biddingId} onChange={(e) => setBiddingId(e.target.value)}>
                  <option value="">Selecione a licitação...</option>
                  {clientBiddings.map((b) => <option key={b.id} value={b.id}>{b.objeto}</option>)}
                </Select>
              </Field>
            )}

            <Field label={tipo === 'mensalista' ? 'Retentor Fixo Mensal (R$)' : 'Valor à Vista (R$)'}>
              <Input type="number" value={valor} onChange={(e) => setValor(parseFloat(e.target.value) || 0)} />
            </Field>

            <Field label="Comissão de Êxito / Sucesso (%)">
              <Input type="number" step="0.1" value={comissao} onChange={(e) => setComissao(parseFloat(e.target.value) || 0)} />
            </Field>

            {tipo === 'mensalista' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Dia de Vencimento">
                    <Input type="number" min={1} max={28} value={diaVencimento} onChange={(e) => setDiaVencimento(parseInt(e.target.value) || 10)} />
                  </Field>
                  <Field label="Vigência (meses)">
                    <Input type="number" min={1} value={vigenciaMeses} onChange={(e) => setVigenciaMeses(parseInt(e.target.value) || 1)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Início da Vigência">
                    <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                  </Field>
                  <Field label="Início do Pagamento">
                    <Input type="date" value={dataInicioPagamento} onChange={(e) => setDataInicioPagamento(e.target.value)} />
                  </Field>
                </div>
                <Field label="Término (calculado)">
                  <div className="w-full bg-base-900 border border-base-800 rounded-lg px-3 py-2 text-sm text-base-400">
                    {termino ? new Date(termino + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  </div>
                </Field>
              </>
            )}

            <Field label="Data de Assinatura">
              <Input type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
            </Field>

            <Field label="Comarca do Foro">
              <Input value={comarcaForo} onChange={(e) => setComarcaForo(e.target.value)} placeholder="Ex: Vacaria/RS" />
            </Field>

            <Field label="Cláusula Adicional Personalizada">
              <Textarea rows={3} value={clausulaAdicional} onChange={(e) => setClausulaAdicional(e.target.value)} placeholder="Texto adicional opcional para incluir no contrato" />
            </Field>

            {podeEditar && (
              <Button onClick={handleSave} disabled={!client || addContract.isPending}>
                {addContract.isPending ? 'Salvando...' : 'Salvar Contrato Gerado'}
              </Button>
            )}
            <ErrorAlert error={addContract.error} />
          </div>
        </Card>

        <Card className="p-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-base-800 flex-wrap gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-accent-400 font-bold">Visualizador de Documento</p>
              <h3 className="font-display font-bold text-sm text-base-100">
                {client ? `Contrato de Consultoria - ${client.name}` : 'Selecione um cliente para gerar o contrato'}
              </h3>
            </div>
            {client && (
              <div className="flex gap-2 flex-wrap">
                {editadoManualmente && (
                  <button onClick={solicitarRegenerar} className="flex items-center gap-1.5 text-[11px] font-semibold text-warning-300 hover:text-warning-200 bg-warning-500/10 border border-warning-500/30 rounded-lg px-3 py-1.5 transition">
                    <RotateCcw className="w-3.5 h-3.5" /> Regenerar do modelo
                  </button>
                )}
                <button
                  onClick={() => setModoEdicao((v) => !v)}
                  className={`flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-3 py-1.5 transition border ${
                    modoEdicao ? 'bg-accent-500 text-base-950 border-accent-500' : 'text-base-300 hover:text-base-100 bg-base-850 border-base-700'
                  }`}
                >
                  {modoEdicao ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                  {modoEdicao ? 'Concluir edição' : 'Editar documento'}
                </button>
                <button onClick={copyText} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition">
                  <Copy className="w-3.5 h-3.5" /> Copiar Texto
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
                  <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
                </button>
              </div>
            )}
          </div>

          {editadoManualmente && (
            <div className="flex items-center gap-2 px-5 py-2 bg-warning-500/10 border-b border-warning-500/20 text-[11.5px] text-warning-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Você editou o texto manualmente — mudar os parâmetros ao lado não altera mais o documento sozinho. Use "Regenerar do modelo" se quiser aplicar os parâmetros de novo (isso descarta o texto editado).
            </div>
          )}

          <div className="p-6 overflow-y-auto max-h-[640px]" style={{ background: '#dedad0' }}>
            {client ? (
              // .print-only fica no documento em si (não no scroll ao redor) —
              // senão o max-height/overflow desta caixa de rolagem cortaria o
              // contrato na impressão depois da primeira "página" visível.
              <div
                ref={docRef}
                contentEditable={modoEdicao}
                suppressContentEditableWarning
                onInput={() => setEditadoManualmente(true)}
                className="contrato-doc print-only"
                style={{
                  background: '#ffffff', color: '#1a1a1a', margin: '0 auto', maxWidth: 620,
                  padding: '40px 46px 50px', fontFamily: 'Verdana, Geneva, sans-serif', fontSize: 12,
                  lineHeight: 1.6, boxShadow: '0 8px 24px -10px rgba(0,0,0,0.3)',
                  outline: modoEdicao ? '2px dashed var(--color-accent-500)' : 'none', outlineOffset: 6,
                }}
              />
            ) : (
              <div className="text-slate-400 text-sm py-16 text-center">Nenhum documento gerado ainda.</div>
            )}
          </div>
        </Card>
      </div>

      {contracts.length > 0 && (
        <div className="px-6 mt-4">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-base-100 mb-4">Contratos Salvos</h3>
            <div className="flex flex-col gap-4">
              {contracts.map((c) => {
                const contractClient = clients.find((cl) => cl.id === c.clientId)
                return (
                  <div key={c.id} className="border border-base-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-base-100 text-sm">{contractClient?.name ?? 'Cliente removido'}</p>
                        <p className="text-[11px] text-base-500">
                          {c.tipo === 'individual' ? 'Individual' : 'Mensalista'} · Valor: {c.retentorFixoMensal ? formatBRL(c.retentorFixoMensal) : '—'} · Comissão: {c.comissaoExito}% · {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    {podeEditar && (
                      <DocumentUploader entityType="contrato" entityId={c.id} category="Contrato" label="Anexar Contrato Assinado" />
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmRegenerarAberto}
        title="Regenerar o documento do zero?"
        description="Você editou o texto manualmente. Regenerar a partir dos parâmetros substitui o documento inteiro pelo modelo — as edições feitas na mão serão perdidas."
        confirmLabel="Regenerar mesmo assim"
        danger
        onCancel={() => setConfirmRegenerarAberto(false)}
        onConfirm={() => { regenerarDocumento(); setConfirmRegenerarAberto(false) }}
      />

      <style>{`
        .contrato-doc .logo-wrap { text-align: center; margin-bottom: 14px; }
        .contrato-doc .logo-wrap img { width: 100px; height: auto; display: block; margin: 0 auto; opacity: .45; }
        .contrato-doc .titulo { text-align: center; font-weight: 700; font-size: 13px; margin: 0 0 16px; }
        .contrato-doc .sec { font-weight: 700; text-decoration: underline; margin: 14px 0 8px; }
        .contrato-doc p { margin: 0 0 9px; text-align: justify; }
        .contrato-doc .cl-num { font-weight: 700; }
        .contrato-doc .assin { text-align: center; margin-top: 18px; }
        .contrato-doc .lin { display: flex; justify-content: space-between; gap: 24px; margin-top: 30px; text-align: center; }
      `}</style>
    </div>
  )
}
