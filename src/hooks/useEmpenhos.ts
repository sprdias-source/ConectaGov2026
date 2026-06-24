import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromEmpenhoRow, toEmpenhoInsert, toTransactionInsert } from '../lib/mappers'
import type { Empenho, Transaction } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['empenhos']

// Gera as transações de comissão (única ou projetada em 12 parcelas) para um
// empenho. Isso roda no momento da criação/edição; quem chama é responsável
// por inserir o array resultante na tabela transactions.
export function buildCommissionTransactions(emp: Empenho): Partial<Transaction>[] {
  if (emp.status === 'Cancelado') return []

  const todayStr = new Date().toISOString().slice(0, 10)
  const statusForDate = (dueDate: string): Transaction['status'] =>
    dueDate < todayStr ? 'Atrasado' : dueDate === todayStr ? 'Vence Hoje' : 'Pendente'

  if (!emp.projetarDozeMeses) {
    return [{
      type: 'Receber',
      category: 'Comissão de Êxito (Licitação Ganha)',
      description: `Comissão Integral s/ Empenho ${emp.numeroEmpenho} (${emp.percentualComissao}% de R$ ${emp.valorEmpenhada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
      clientId: emp.clientId,
      biddingId: emp.biddingId,
      empenhoId: emp.id,
      value: emp.valorComissaoTotal,
      dueDate: emp.dataEmpenho,
      paymentMethod: 'Boleto',
      status: statusForDate(emp.dataEmpenho),
    }]
  }

  const totalMonths = 12
  const splitValue = Math.round((emp.valorComissaoTotal / totalMonths) * 100) / 100
  const baseDate = new Date(emp.dataEmpenho + 'T12:00:00')
  const result: Partial<Transaction>[] = []

  for (let i = 1; i <= totalMonths; i++) {
    const d = new Date(baseDate)
    d.setMonth(baseDate.getMonth() + (i - 1))
    const dueDateStr = d.toISOString().slice(0, 10)
    const value = i === totalMonths
      ? Math.round((emp.valorComissaoTotal - splitValue * (totalMonths - 1)) * 100) / 100
      : splitValue

    result.push({
      type: 'Receber',
      category: 'Comissão de Êxito (Projetada - 12 meses)',
      description: `Comissão s/ Empenho ${emp.numeroEmpenho} (${emp.percentualComissao}% de R$ ${emp.valorEmpenhada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) - Parc. ${i}/${totalMonths}`,
      clientId: emp.clientId,
      biddingId: emp.biddingId,
      empenhoId: emp.id,
      value,
      dueDate: dueDateStr,
      paymentMethod: 'Boleto',
      status: statusForDate(dueDateStr),
      isProjected: true,
      projectionParentId: `proj-emp-${emp.id}`,
      projectionMonthNumber: i,
    })
  }
  return result
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
  // deixar dado "pela metade" — isso é o equivalente a uma transação atômica
  // feita no lado do cliente, já que o Supabase REST não expõe transações
  // multi-tabela diretamente para o client.
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
      logEvent('Criou Empenho', `Registrou empenho nº ${created.numeroEmpenho} e gerou as parcelas de comissão correspondentes`)
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
      // Remove parcelas não pagas antes (o cascade do banco também cobriria,
      // mas fazemos explícito para registrar a intenção no log).
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

  return {
    empenhos: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addEmpenho,
    updateEmpenhoStatus,
    deleteEmpenho,
  }
}
