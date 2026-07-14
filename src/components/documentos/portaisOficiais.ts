// Mapa central dos documentos automatizáveis: URL do portal oficial, quais
// dados o bookmarklet precisa (bater com as chaves do PORTAIS no
// preencher-cnpj.bookmarklet.js), e quantos dias de validade usar como
// sugestão inicial no upload manual (o usuário pode sempre ajustar pela
// data real impressa no documento).
//
// IMPORTANTE: as chaves aqui devem bater exatamente com o tipo `DocumentTipo`
// (types/domain.ts). Corrigido nesta versão: `fgts_caixa` -> `fgts`,
// `cnd_municipal_vacaria` -> `cnd_municipal` (estavam com nomes diferentes
// do resto do app). Removido `cnpj_cartao` (Cartão CNPJ já funciona 100%
// automático, não precisa de fallback manual). Adicionado
// `certidao_falencia_rs` (6º documento do checklist).
export const PORTAIS_OFICIAIS: Record<string, {
  url: string
  camposNecessarios: Array<'cnpj' | 'nome' | 'endereco'>
  validadeDiasSugerida: number
}> = {
  cndt: {
    url: 'https://cndt-certidao.tst.jus.br/gerarCertidao.faces',
    camposNecessarios: ['cnpj'],
    validadeDiasSugerida: 180,
  },
  cnd_federal: {
    url: 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj',
    camposNecessarios: ['cnpj'],
    validadeDiasSugerida: 180,
  },
  cnd_estadual_rs: {
    url: 'https://www.sefaz.rs.gov.br/sat/CertidaoSitFiscalSolic.aspx',
    camposNecessarios: ['cnpj'],
    validadeDiasSugerida: 90,
  },
  cnd_municipal: {
    url: 'https://webapp1-vacaria.cidade360.cloud:8443/cidadao/servlet/br.com.cetil.ar.jvlle.hatendimento',
    camposNecessarios: ['cnpj'],
    validadeDiasSugerida: 90,
  },
  fgts: {
    url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
    camposNecessarios: ['cnpj'],
    validadeDiasSugerida: 30,
  },
  certidao_falencia_rs: {
    url: 'https://www.tjrs.jus.br/novo/processos-e-servicos/servicos-processuais/emissao-de-antecedentes-e-certidoes/',
    camposNecessarios: ['cnpj', 'nome', 'endereco'],
    validadeDiasSugerida: 90,
  },
  cnpj_cartao: {
    url: 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/',
    camposNecessarios: ['cnpj'],
    validadeDiasSugerida: 60,
  },
}
