import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayLocalISO, dateToLocalISO } from '../lib/dateUtils'
import { supabase } from '../lib/supabase'
import { fromEmpenhoRow, toEmpenhoInsert, toTransactionInsert } from '../lib/mappers'
import type { Empenho, Transaction } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['empenhos']

function statusForDate(dueDate: string): Transaction['status'] {
  const todayStr = todayLocalISO()
  return dueDate < todayStr ? 'Atrasado' : dueDate === todayStr ? 'Vence Hoje' : 'Pendente'
}

// CORREÇÃO DE BUG: o JavaScript "estoura" o mês quando o dia não existe
// no mês de destino. Ex: 31/01 + 1 mês deveria ser fevereiro, mas como
// fevereiro não tem dia 31, o setMonth() nativo empurra automaticamente
// para 03/03 — pulando fevereiro inteiro e fazendo duas parcelas caírem
// na mesma data de março. Esta versão verifica se o overflow aconteceu e,
// se sim, ajusta para o ÚLTIMO DIA do mês de destino (ex: 28 ou 29/02),
// que é o comportamento esperado por qualquer usuário.
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  const originalDay = d.getDate()
  const targetMonth = d.getMonth() + months

  d.setMonth(targetMonth)
  // Se o dia "estourou" para o mês seguinte (porque o mês de destino é
  // mais curto), volta para o último dia válido do mês de destino.
  if (d.getDate() !== originalDay) {
    d.setDate(0) // dia 0 do mês atual = último dia do mês anterior
  }
  return dateToLocalISO(d)
}

// Gera as transações de comissão de um empenho, de acordo com o modo de
// parcelamento escolhido:
// - integral: uma única parcela com o valor total
// - quantidade_fixa: N parcelas que DIVIDEM o valor total entre si (a
//   última absorve o resto do arredondamento, para o somatório ficar exato)
// - recorrente: N parcelas mensais (ou na periodicidade escolhida) que
//   REPETEM o valor total em cada uma — não divide. Modela cobranças
//   recorrentes de contrato (ex: manutenção mensal), onde N pode ser
//   aumentado depois se o contrato for aditado/prorrogado.
export function buildCommissionTransactions(emp: Empenho): Partial<Transaction>[] {
  if (emp.status === 'Cancelado') return []
  // Sem valor de comissão nenhum (ex: 0% de comissão, digitado ou
  // deixado zerado sem querer), dividir por N parcelas só criaria N
  // lançamentos "fantasma" de R$ 0,00 poluindo Contas a Receber — nenhuma
  // parcela faz sentido nesse caso.
  if (!emp.valorComissaoTotal || emp.valorComissaoTotal <= 0) return []

  const baseDescription = `Comissão s/ Empenho ${emp.numeroEmpenho} (${emp.percentualComissao}% de R$ ${emp.valorEmpenhada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`

  if (emp.modoParcelamento === 'quantidade_fixa' && emp.quantidadeParcelas && emp.quantidadeParcelas > 1) {
    const total = emp.quantidadeParcelas
    const splitValue = Math.round((emp.valorComissaoTotal / total) * 100) / 100
    const result: Partial<Transaction>[] = []
    for (let i = 1; i <= total; i++) {
      const dueDate = addMonths(emp.dataEmpenho, i - 1)
      const value = i === total ? Math.round((emp.valorComissaoTotal - splitValue * (total - 1)) * 100) / 100 : splitValue
      result.push({
        type: 'Receber',
        category: 'Comissão de Êxito (Parcelada)',
        description: `${baseDescription} - Parc. ${i}/${total}`,
        clientId: emp.clientId,
        biddingId: emp.biddingId,
        empenhoId: emp.id,
        value,
        dueDate,
        paymentMethod: 'Boleto',
        status: statusForDate(dueDate),
        isProjected: true,
        projectionParentId: `proj-emp-${emp.id}`,
        projectionMonthNumber: i,
      })
    }
    return result
  }

  if (emp.modoParcelamento === 'recorrente') {
    const months = ({ mensal: 1, trimestral: 3, semestral: 6, anual: 12 } as Record<string, number>)[emp.periodicidade ?? 'mensal'] ?? 1
    const total = Math.max(1, emp.quantidadeParcelas ?? 1)
    const result: Partial<Transaction>[] = []
    for (let i = 1; i <= total; i++) {
      const dueDate = addMonths(emp.dataEmpenho, months * (i - 1))
      result.push({
        type: 'Receber',
        category: 'Comissão de Êxito (Recorrente)',
        description: `${baseDescription} - Parc. ${i}/${total}`,
        clientId: emp.clientId,
        biddingId: emp.biddingId,
        empenhoId: emp.id,
        value: emp.valorComissaoTotal,
        dueDate,
        paymentMethod: 'Boleto',
        status: statusForDate(dueDate),
        isProjected: true,
        projectionParentId: `proj-emp-${emp.id}`,
        projectionMonthNumber: i,
      })
    }
    return result
  }

  // integral
  return [{
    type: 'Receber',
    category: 'Comissão de Êxito (Licitação Ganha)',
    description: baseDescription,
    clientId: emp.clientId,
    biddingId: emp.biddingId,
    empenhoId: emp.id,
    value: emp.valorComissaoTotal,
    dueDate: emp.dataEmpenho,
    paymentMethod: 'Boleto',
    status: statusForDate(emp.dataEmpenho),
  }]
}

export function useEmpenhos() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empenhos')
        .select('*')
        .order('data_empenho', { ascending: false })
      if (error) throw error
      return data.map(fromEmpenhoRow)
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
  }

  // Cria o empenho e, na mesma operação lógica, gera as parcelas de comissão.
  // Se a criação das transações falhar, removemos o empenho criado para não
  // deixar dado "pela metade".
  const addEmpenho = useMutation({
    mutationFn: async (empenho: Partial<Empenho>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data: empData, error: empError } = await supabase
        .from('empenhos')
        .insert(toEmpenhoInsert(empenho, user.id))
        .select()
        .single()
      if (empError) throw empError
      const created = fromEmpenhoRow(empData)

      const txs = buildCommissionTransactions(created)
      if (txs.length > 0) {
        const { error: txError } = await supabase
          .from('transactions')
          .insert(txs.map((t) => toTransactionInsert(t, user.id)))
        if (txError) {
          await supabase.from('empenhos').delete().eq('id', created.id)
          throw txError
        }
      }
      return created
    },
    onSuccess: (created) => {
      invalidate()
      logEvent('Criou Empenho', `Registrou empenho nº ${created.numeroEmpenho} vinculado à licitação e gerou as parcelas de comissão correspondentes`)
    },
  })

  // Atualiza os dados do empenho e recalcula as parcelas de comissão ainda
  // não pagas — preserva qualquer parcela já marcada como "Pago" (histórico
  // financeiro real nunca é apagado), igual ao princípio usado para
  // mensalidades de clientes.
  const updateEmpenho = useMutation({
    mutationFn: async (empenho: Empenho) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('empenhos')
        .update(toEmpenhoInsert(empenho, empenho.userId))
        .eq('id', empenho.id)
        .select()
        .single()
      if (error) throw error
      const updated = fromEmpenhoRow(data)

      await supabase.from('transactions').delete().eq('empenho_id', updated.id).neq('status', 'Pago')

      const allTxs = buildCommissionTransactions(updated)
      const { data: paidTxs } = await supabase
        .from('transactions')
        .select('projection_month_number, value')
        .eq('empenho_id', updated.id)
        .eq('status', 'Pago')
      const paidNumbers = new Set((paidTxs ?? []).map((p) => p.projection_month_number))
      let txsToInsert = allTxs.filter((t) => !paidNumbers.has(t.projectionMonthNumber ?? null))

      // Nos modos "quantidade_fixa" e "integral", valorComissaoTotal é um
      // total único (dividido em parcelas ou pago de uma vez) — se já
      // existem parcelas pagas (a valores antigos, que nunca são
      // alterados, inclusive se foram pagas ANTES de trocar de modo de
      // parcelamento), o valor já recebido precisa ser descontado do novo
      // valorComissaoTotal antes de gerar o que falta. Sem isso, o valor já
      // pago fica somado por cima do novo total inteiro — ex: empenho de
      // R$9.000 em 3x, 1ª parcela de R$3.000 já paga, usuário muda pra
      // "integral" mantendo R$9.000: sem este ajuste o sistema geraria uma
      // nova transação de R$9.000 inteiros, resultando em R$12.000
      // cobrados/lançados pra um empenho de R$9.000.
      // "recorrente" fica de fora de propósito: cada parcela ali é um valor
      // independente que se repete (não uma fatia de um total único), então
      // o filtro por projectionMonthNumber acima já evita duplicar sozinho.
      if ((updated.modoParcelamento === 'quantidade_fixa' || updated.modoParcelamento === 'integral') && paidNumbers.size > 0 && txsToInsert.length > 0) {
        const totalJaPago = (paidTxs ?? []).reduce((s, p) => s + (p.value ?? 0), 0)
        const restante = Math.max(0, updated.valorComissaoTotal - totalJaPago)
        if (updated.modoParcelamento === 'integral') {
          // Modo integral nunca divide — só ajusta o valor da transação
          // única (ou remove ela, se o total já pago cobrir tudo).
          txsToInsert = restante > 0 ? [{ ...txsToInsert[0], value: Math.round(restante * 100) / 100 }] : []
        } else {
          const splitValue = Math.round((restante / txsToInsert.length) * 100) / 100
          txsToInsert = txsToInsert.map((t, idx) => ({
            ...t,
            value: idx === txsToInsert.length - 1
              ? Math.round((restante - splitValue * (txsToInsert.length - 1)) * 100) / 100
              : splitValue,
          }))
        }
      }

      if (txsToInsert.length > 0) {
        const { error: txError } = await supabase
          .from('transactions')
          .insert(txsToInsert.map((t) => toTransactionInsert(t, user.id)))
        if (txError) throw txError
      }
      return updated
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Editou Empenho', `Atualizou o empenho nº ${updated.numeroEmpenho} e recalculou as parcelas pendentes`)
    },
  })

  const updateEmpenhoStatus = useMutation({
    mutationFn: async ({ empenho, newStatus }: { empenho: Empenho; newStatus: Empenho['status'] }) => {
      const { data, error } = await supabase
        .from('empenhos')
        .update({ status: newStatus })
        .eq('id', empenho.id)
        .select()
        .single()
      if (error) throw error

      if (newStatus === 'Cancelado') {
        await supabase
          .from('transactions')
          .delete()
          .eq('empenho_id', empenho.id)
          .neq('status', 'Pago')
      }
      return fromEmpenhoRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Mudou Status do Empenho', `Alterou o status do empenho "${updated.numeroEmpenho}" para ${updated.status}`)
    },
  })

  const deleteEmpenho = useMutation({
    mutationFn: async (empenho: Empenho) => {
      await supabase.from('transactions').delete().eq('empenho_id', empenho.id).neq('status', 'Pago')
      const { error } = await supabase.from('empenhos').delete().eq('id', empenho.id)
      if (error) throw error
      return empenho
    },
    onSuccess: (deleted) => {
      invalidate()
      logEvent('Excluiu Empenho', `Removeu empenho nº ${deleted.numeroEmpenho} e suas parcelas pendentes`)
    },
  })

  const toggleEmpenhoActive = useMutation({
    mutationFn: async ({ empenho, isActive }: { empenho: Empenho; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('empenhos')
        .update({ is_active: isActive })
        .eq('id', empenho.id)
        .select()
        .single()
      if (error) throw error
      return fromEmpenhoRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent(
        updated.isActive ? 'Reativou Empenho' : 'Inativou Empenho',
        `${updated.isActive ? 'Reativou' : 'Inativou'} o empenho nº ${updated.numeroEmpenho}`
      )
    },
  })

  const checkEmpenhoHasFinancialHistory = async (empenhoId: string): Promise<boolean> => {
    const { count, error } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('empenho_id', empenhoId)
      .eq('status', 'Pago')
    // Se a consulta falhar (rede, RLS, timeout), assume que HÁ histórico —
    // é o lado seguro do erro: melhor mostrar o aviso forte de exclusão à
    // toa do que deixar passar batido um empenho com pagamentos já feitos.
    if (error) return true
    return (count ?? 0) > 0
  }

  return {
    empenhos: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addEmpenho,
    updateEmpenho,
    updateEmpenhoStatus,
    deleteEmpenho,
    toggleEmpenhoActive,
    checkEmpenhoHasFinancialHistory,
  }
}
