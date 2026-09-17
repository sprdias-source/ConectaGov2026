import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromSimplesNacionalFaixaRow, fromSimplesNacionalPartilhaRow } from '../lib/mappers'
import { useAuth } from './useAuth'
import { useTransactions } from './useTransactions'
import { useFinancialAccounts } from './useFinancialAccounts'
import { useRegimeTributario } from './useRegimeTributario'
import { contasInternasIds } from './useAccountBalances'
import type { SimplesNacionalFaixa, SimplesNacionalPartilha, TributoPartilha } from '../types/domain'

// Faixas do Anexo III — valores informados pelo próprio usuário (conferidos
// contra a legislação), Resolução CGSN 140/2018. Só o Anexo III é semeado
// por enquanto (é o que a empresa usa hoje); o Anexo V fica pra quando o
// Fator R indicar necessidade real de trocar.
const SEED_FAIXAS_ANEXO_III: Omit<SimplesNacionalFaixa, 'id' | 'userId' | 'createdAt' | 'anexo' | 'vigenciaInicio' | 'vigenciaFim'>[] = [
  { faixa: 1, rbt12Min: 0, rbt12Max: 180000, aliquotaNominal: 6.00, parcelaDeduzir: 0, conferido: true },
  { faixa: 2, rbt12Min: 180000.01, rbt12Max: 360000, aliquotaNominal: 11.20, parcelaDeduzir: 9360.00, conferido: true },
  { faixa: 3, rbt12Min: 360000.01, rbt12Max: 720000, aliquotaNominal: 13.50, parcelaDeduzir: 17640.00, conferido: true },
  { faixa: 4, rbt12Min: 720000.01, rbt12Max: 1800000, aliquotaNominal: 16.00, parcelaDeduzir: 35640.00, conferido: true },
  { faixa: 5, rbt12Min: 1800000.01, rbt12Max: 3600000, aliquotaNominal: 21.00, parcelaDeduzir: 125640.00, conferido: true },
  { faixa: 6, rbt12Min: 3600000.01, rbt12Max: 4800000, aliquotaNominal: 33.00, parcelaDeduzir: 648000.00, conferido: true },
]

// Partilha percentual do DAS por tributo — só a Faixa 1 foi validada contra
// um documento de arrecadação real da empresa (bate 1-pra-1 com o DAS de
// Maio/2026). Faixas 2 a 6 vêm de memória e ficam marcadas como não
// conferidas até alguém revisar contra a Resolução CGSN 140/2018 (Anexo
// XI) — a partir da Faixa 4 existe ainda a regra do sublimite que pode
// alterar como o ISS é calculado, não reproduzida aqui.
const SEED_PARTILHA_ANEXO_III: { faixa: number; tributo: TributoPartilha; percentual: number; conferido: boolean }[] = [
  { faixa: 1, tributo: 'IRPJ', percentual: 4.00, conferido: true },
  { faixa: 1, tributo: 'CSLL', percentual: 3.50, conferido: true },
  { faixa: 1, tributo: 'COFINS', percentual: 12.82, conferido: true },
  { faixa: 1, tributo: 'PIS', percentual: 2.78, conferido: true },
  { faixa: 1, tributo: 'CPP', percentual: 43.40, conferido: true },
  { faixa: 1, tributo: 'ISS', percentual: 33.50, conferido: true },

  { faixa: 2, tributo: 'IRPJ', percentual: 4.00, conferido: false },
  { faixa: 2, tributo: 'CSLL', percentual: 3.50, conferido: false },
  { faixa: 2, tributo: 'COFINS', percentual: 14.05, conferido: false },
  { faixa: 2, tributo: 'PIS', percentual: 3.05, conferido: false },
  { faixa: 2, tributo: 'CPP', percentual: 43.40, conferido: false },
  { faixa: 2, tributo: 'ISS', percentual: 32.00, conferido: false },

  { faixa: 3, tributo: 'IRPJ', percentual: 4.00, conferido: false },
  { faixa: 3, tributo: 'CSLL', percentual: 3.50, conferido: false },
  { faixa: 3, tributo: 'COFINS', percentual: 13.64, conferido: false },
  { faixa: 3, tributo: 'PIS', percentual: 2.96, conferido: false },
  { faixa: 3, tributo: 'CPP', percentual: 43.40, conferido: false },
  { faixa: 3, tributo: 'ISS', percentual: 32.50, conferido: false },

  { faixa: 4, tributo: 'IRPJ', percentual: 4.00, conferido: false },
  { faixa: 4, tributo: 'CSLL', percentual: 3.50, conferido: false },
  { faixa: 4, tributo: 'COFINS', percentual: 14.10, conferido: false },
  { faixa: 4, tributo: 'PIS', percentual: 3.05, conferido: false },
  { faixa: 4, tributo: 'CPP', percentual: 43.40, conferido: false },
  { faixa: 4, tributo: 'ISS', percentual: 31.95, conferido: false },

  { faixa: 5, tributo: 'IRPJ', percentual: 4.00, conferido: false },
  { faixa: 5, tributo: 'CSLL', percentual: 3.50, conferido: false },
  { faixa: 5, tributo: 'COFINS', percentual: 15.14, conferido: false },
  { faixa: 5, tributo: 'PIS', percentual: 3.28, conferido: false },
  { faixa: 5, tributo: 'CPP', percentual: 43.40, conferido: false },
  { faixa: 5, tributo: 'ISS', percentual: 30.68, conferido: false },

  { faixa: 6, tributo: 'IRPJ', percentual: 35.00, conferido: false },
  { faixa: 6, tributo: 'CSLL', percentual: 15.00, conferido: false },
  { faixa: 6, tributo: 'COFINS', percentual: 16.44, conferido: false },
  { faixa: 6, tributo: 'PIS', percentual: 3.56, conferido: false },
  { faixa: 6, tributo: 'CPP', percentual: 30.00, conferido: false },
  { faixa: 6, tributo: 'ISS', percentual: 0.00, conferido: false },
]

export function useSimplesNacional() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { transactions } = useTransactions()
  const { accounts } = useFinancialAccounts()
  const { historico } = useRegimeTributario()

  // Lançamento vinculado a uma conta Caixa Interno (fictícia, controle
  // pessoal) não é receita de verdade — não pode entrar na base do
  // Simples Nacional (RBT12/DAS). Mesma regra do Patrimônio em
  // useAccountBalances.ts, aplicada aqui por ser o achado mais sensível:
  // um lançamento vinculado por engano infla a base do imposto de verdade.
  const transactionsReais = useMemo(() => {
    const internalIds = contasInternasIds(accounts)
    return transactions.filter((t) => !internalIds.has(t.accountId ?? ''))
  }, [transactions, accounts])

  const faixasQuery = useQuery({
    queryKey: ['simples_nacional_faixas'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('simples_nacional_faixas').select('*').order('anexo').order('faixa')
      if (error) throw error

      if (data.length === 0 && user) {
        const seed = SEED_FAIXAS_ANEXO_III.map((f) => ({
          user_id: user.id, anexo: 'III', faixa: f.faixa, rbt12_min: f.rbt12Min, rbt12_max: f.rbt12Max,
          aliquota_nominal: f.aliquotaNominal, parcela_deduzir: f.parcelaDeduzir, conferido: f.conferido,
        }))
        const { data: seeded, error: seedError } = await supabase.from('simples_nacional_faixas').insert(seed).select()
        if (seedError) throw seedError
        return seeded.map(fromSimplesNacionalFaixaRow)
      }
      return data.map(fromSimplesNacionalFaixaRow)
    },
  })

  const partilhaQuery = useQuery({
    queryKey: ['simples_nacional_partilha'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('simples_nacional_partilha').select('*').order('anexo').order('faixa')
      if (error) throw error

      if (data.length === 0 && user) {
        const seed = SEED_PARTILHA_ANEXO_III.map((p) => ({
          user_id: user.id, anexo: 'III', faixa: p.faixa, tributo: p.tributo, percentual: p.percentual, conferido: p.conferido,
        }))
        const { data: seeded, error: seedError } = await supabase.from('simples_nacional_partilha').insert(seed).select()
        if (seedError) throw seedError
        return seeded.map(fromSimplesNacionalPartilhaRow)
      }
      return data.map(fromSimplesNacionalPartilhaRow)
    },
  })

  const faixas: SimplesNacionalFaixa[] = faixasQuery.data ?? []
  const partilha: SimplesNacionalPartilha[] = partilhaQuery.data ?? []

  const invalidateFaixas = () => queryClient.invalidateQueries({ queryKey: ['simples_nacional_faixas'] })

  const updateFaixa = useMutation({
    mutationFn: async (f: SimplesNacionalFaixa) => {
      const { error } = await supabase
        .from('simples_nacional_faixas')
        .update({
          rbt12_min: f.rbt12Min, rbt12_max: f.rbt12Max, aliquota_nominal: f.aliquotaNominal,
          parcela_deduzir: f.parcelaDeduzir, conferido: f.conferido,
        })
        .eq('id', f.id)
      if (error) throw error
    },
    onSuccess: invalidateFaixas,
  })

  // RBT12: soma da receita bruta (transactions type='Receber') dos últimos
  // 12 meses corridos até a competência de referência, por data de
  // vencimento (mesma convenção de "competência" usada no resto do app —
  // Relatórios, Dashboard). Não filtra por status: é regime de competência,
  // não de caixa — o valor de uma competência fechada não pode ficar se
  // mexendo conforme parcelas atrasadas vão sendo pagas depois. Inclui o
  // período em que a empresa era MEI: é o mesmo CNPJ, sem interrupção de
  // atividade (transformação de Empresário Individual em Sociedade
  // Limitada), então não há "início de atividade" novo pra zerar o RBT12.
  //
  // Empresa com menos de 12 meses de atividade até a competência de
  // referência (LC 123/2006 art. 18 §2º): a soma não é da janela inteira de
  // 12 meses (a empresa não existia em parte dela) — é a receita acumulada
  // desde o início de atividade, proporcionalizada pra 12 meses. Pra
  // CONECTAGOV isso nunca dispara (mais de 12 meses de histórico), mas sem
  // essa regra uma conta nova no sistema calcularia uma alíquota muito
  // abaixo da devida nos primeiros meses.
  const calcularRbt12 = (competenciaRef: string): number => {
    const [ano, mes] = competenciaRef.split('-').map(Number)
    const fim = new Date(ano, mes - 1, 1)
    const inicioJanela = new Date(ano, mes - 12, 1)

    const inicioAtividadeStr = historico[0]?.vigenciaInicio
    const inicioAtividadeMes = inicioAtividadeStr
      ? (() => { const d = new Date(inicioAtividadeStr + 'T12:00:00'); return new Date(d.getFullYear(), d.getMonth(), 1) })()
      : null
    const inicioReal = inicioAtividadeMes && inicioAtividadeMes > inicioJanela ? inicioAtividadeMes : inicioJanela

    const somaPeriodo = transactionsReais
      .filter((t) => t.type === 'Receber')
      .filter((t) => {
        const d = new Date(t.dueDate + 'T12:00:00')
        const dMesInicio = new Date(d.getFullYear(), d.getMonth(), 1)
        return dMesInicio >= inicioReal && dMesInicio < fim
      })
      // Juros e multa recebidos por atraso são receita financeira, não
      // integram a receita bruta que forma a base do Simples Nacional —
      // sem excluir isso, um cliente que paga atrasado infla o RBT12 e
      // pode empurrar a empresa pra uma faixa mais cara indevidamente.
      .reduce((s, t) => s + t.value - (t.juros ?? 0) - (t.multa ?? 0), 0)

    let rbt12 = somaPeriodo
    if (inicioAtividadeMes && inicioAtividadeMes > inicioJanela) {
      const mesesAtividade = (fim.getFullYear() - inicioAtividadeMes.getFullYear()) * 12 + (fim.getMonth() - inicioAtividadeMes.getMonth())
      if (mesesAtividade > 0 && mesesAtividade < 12) rbt12 = somaPeriodo * (12 / mesesAtividade)
    }
    // Arredonda antes de qualquer comparação com os limites de faixa —
    // sem isso, um resíduo de ponto flutuante bem no limite de uma faixa
    // (ex: 180000.00000000003) pode não bater nem no "<=" da faixa de
    // baixo nem no ">=" da faixa de cima, e a conferência do DAS some da
    // tela sem nenhum aviso.
    return Math.round(rbt12 * 100) / 100
  }

  const encontrarFaixa = (anexo: 'III' | 'V', rbt12: number): SimplesNacionalFaixa | null =>
    faixas.find((f) => f.anexo === anexo && rbt12 >= f.rbt12Min && rbt12 <= f.rbt12Max) ?? null

  // Sublimite (Resolução CGSN 140/2018, LC 123/2006 art. 19-A): acima de
  // R$ 3.600.000,00 de RBT12, o ISS/ICMS pode passar a ser recolhido fora
  // do DAS, o que muda a partilha por tributo — não modelado aqui (ver
  // SEED_PARTILHA_ANEXO_III). Sinaliza pra UI avisar em vez de mostrar um
  // detalhamento por tributo que pode estar incompleto nessa faixa.
  const SUBLIMITE_RBT12 = 3_600_000

  // Regime tributário que estava DE FATO vigente na competência pedida —
  // nunca o regime atual. Sem isso, escolher uma competência antiga (ex:
  // quando a empresa ainda era MEI) calculava um DAS estimado usando o
  // regime de hoje, pra um período em que nem existia DAS proporcional.
  const regimeNaCompetencia = (competenciaRef: string) => {
    const primeiroDiaMes = `${competenciaRef}-01`
    return historico.find((h) => h.vigenciaInicio <= primeiroDiaMes && (h.vigenciaFim === null || h.vigenciaFim >= primeiroDiaMes)) ?? null
  }

  // Fórmula da alíquota efetiva (Resolução CGSN 140/2018): [(RBT12 ×
  // nominal) − PD] / RBT12. Com RBT12 = 0 (empresa sem nenhuma receita
  // lançada ainda nos últimos 12 meses) a divisão não existe — usa a
  // nominal da própria faixa direto, que na Faixa 1 tem PD = 0 e dá o
  // mesmo resultado de qualquer forma.
  const calcularAliquotaEfetiva = (faixaAtual: SimplesNacionalFaixa, rbt12: number): number => {
    if (rbt12 <= 0) return faixaAtual.aliquotaNominal
    return ((rbt12 * (faixaAtual.aliquotaNominal / 100) - faixaAtual.parcelaDeduzir) / rbt12) * 100
  }

  // Conferência do DAS de uma competência: receita do mês × alíquota
  // efetiva, detalhada por tributo via a partilha da faixa. Só faz sentido
  // enquanto o regime vigente for Simples Nacional — MEI usa valor fixo
  // (não modelado aqui) e Lucro Presumido/Real não usam este cálculo.
  const conferenciaDas = useMemo(() => {
    return (competenciaRef: string) => {
      const regime = regimeNaCompetencia(competenciaRef)
      if (!regime || regime.regime !== 'simples_nacional' || !regime.anexoSimples) return null
      const anexo = regime.anexoSimples as 'III' | 'V'

      const rbt12 = calcularRbt12(competenciaRef)
      const faixaAtual = encontrarFaixa(anexo, rbt12)
      if (!faixaAtual) return null

      const aliquotaEfetiva = calcularAliquotaEfetiva(faixaAtual, rbt12)
      const receitaMes = transactionsReais
        .filter((t) => t.type === 'Receber' && t.dueDate.slice(0, 7) === competenciaRef)
        // Mesma exclusão do RBT12: juros/multa recebidos não são receita
        // operacional sujeita ao Simples Nacional.
        .reduce((s, t) => s + t.value - (t.juros ?? 0) - (t.multa ?? 0), 0)
      const dasEstimado = receitaMes * (aliquotaEfetiva / 100)

      const breakdown = partilha
        .filter((p) => p.anexo === anexo && p.faixa === faixaAtual.faixa)
        .map((p) => ({ tributo: p.tributo, percentual: p.percentual, valor: dasEstimado * (p.percentual / 100), conferido: p.conferido }))

      const faltaProximaFaixa = faixaAtual.faixa < 6 ? faixaAtual.rbt12Max - rbt12 : null

      return { rbt12, faixaAtual, aliquotaEfetiva, receitaMes, dasEstimado, breakdown, faltaProximaFaixa, acimaDoSublimite: rbt12 > SUBLIMITE_RBT12 }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionsReais, historico, faixas, partilha])

  return {
    faixas,
    partilha,
    isLoading: faixasQuery.isLoading || partilhaQuery.isLoading,
    updateFaixa,
    calcularRbt12,
    conferenciaDas,
  }
}
