import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromSimplesNacionalFaixaRow, fromSimplesNacionalPartilhaRow } from '../lib/mappers'
import { useAuth } from './useAuth'
import { useTransactions } from './useTransactions'
import { useRegimeTributario } from './useRegimeTributario'
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
  const { vigente } = useRegimeTributario()

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
  const calcularRbt12 = (competenciaRef: string): number => {
    const [ano, mes] = competenciaRef.split('-').map(Number)
    const fim = new Date(ano, mes - 1, 1)
    const inicio = new Date(ano, mes - 12, 1)
    return transactions
      .filter((t) => t.type === 'Receber')
      .filter((t) => {
        const d = new Date(t.dueDate + 'T12:00:00')
        const dMesInicio = new Date(d.getFullYear(), d.getMonth(), 1)
        return dMesInicio >= inicio && dMesInicio < fim
      })
      .reduce((s, t) => s + t.value, 0)
  }

  const encontrarFaixa = (anexo: 'III' | 'V', rbt12: number): SimplesNacionalFaixa | null =>
    faixas.find((f) => f.anexo === anexo && rbt12 >= f.rbt12Min && rbt12 <= f.rbt12Max) ?? null

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
      if (!vigente || vigente.regime !== 'simples_nacional' || !vigente.anexoSimples) return null
      const anexo = vigente.anexoSimples as 'III' | 'V'

      const rbt12 = calcularRbt12(competenciaRef)
      const faixaAtual = encontrarFaixa(anexo, rbt12)
      if (!faixaAtual) return null

      const aliquotaEfetiva = calcularAliquotaEfetiva(faixaAtual, rbt12)
      const receitaMes = transactions
        .filter((t) => t.type === 'Receber' && t.dueDate.slice(0, 7) === competenciaRef)
        .reduce((s, t) => s + t.value, 0)
      const dasEstimado = receitaMes * (aliquotaEfetiva / 100)

      const breakdown = partilha
        .filter((p) => p.anexo === anexo && p.faixa === faixaAtual.faixa)
        .map((p) => ({ tributo: p.tributo, percentual: p.percentual, valor: dasEstimado * (p.percentual / 100), conferido: p.conferido }))

      const faltaProximaFaixa = faixaAtual.faixa < 6 ? faixaAtual.rbt12Max - rbt12 : null

      return { rbt12, faixaAtual, aliquotaEfetiva, receitaMes, dasEstimado, breakdown, faltaProximaFaixa }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, vigente, faixas, partilha])

  return {
    faixas,
    partilha,
    isLoading: faixasQuery.isLoading || partilhaQuery.isLoading,
    updateFaixa,
    calcularRbt12,
    conferenciaDas,
  }
}
