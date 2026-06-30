import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromCategoryRow } from '../lib/mappers'
import { useAuth } from './useAuth'

const DEFAULT_PAGAR = [
  'Impostos (DAS/Simples)', 'ISS', 'Aluguel', 'Folha de Pagamento', 'Pró-Labore',
  'INSS a Recolher (GPS)', 'IRRF a Recolher (DARF)', 'FGTS a Recolher',
  'Sistemas de Licitação (Apoio)', 'Internet e Telefone', 'Contabilidade',
  'Marketing/Anúncios', 'Material de Escritório', 'Taxas de Cartório/Envios', 'Outros Gastos',
]

const DEFAULT_RECEBER = [
  'Mensalidade Assessoria', 'Taxa de Participação Individual',
  'Comissão de Êxito (Licitação Ganha)', 'Comissão de Êxito (Projetada - 12 meses)',
  'Consultoria Avulsa', 'Outras Receitas',
]

export function useCategories() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['categories'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name')
      if (error) throw error

      // Primeira vez que o usuário usa o sistema: semeia categorias padrão
      if (data.length === 0 && user) {
        const seed = [
          ...DEFAULT_PAGAR.map((name) => ({ user_id: user.id, type: 'Pagar', name })),
          ...DEFAULT_RECEBER.map((name) => ({ user_id: user.id, type: 'Receber', name })),
        ]
        const { data: seeded, error: seedError } = await supabase
          .from('categories')
          .insert(seed)
          .select()
        if (seedError) throw seedError
        return seeded.map(fromCategoryRow)
      }

      // Usuário já tinha categorias cadastradas de antes (de uma versão
      // anterior do sistema) — complementa só as que foram adicionadas
      // depois (ex: INSS/IRRF/FGTS) e ainda não existem para ele, sem
      // duplicar nem mexer no que já está lá.
      if (user) {
        const existingPagarNames = new Set(data.filter((c) => c.type === 'Pagar').map((c) => c.name))
        const missing = DEFAULT_PAGAR.filter((name) => !existingPagarNames.has(name))
        if (missing.length > 0) {
          const { data: added, error: addError } = await supabase
            .from('categories')
            .insert(missing.map((name) => ({ user_id: user.id, type: 'Pagar', name })))
            .select()
          if (!addError && added) {
            return [...data, ...added].map(fromCategoryRow)
          }
        }
      }

      return data.map(fromCategoryRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] })

  const addCategory = useMutation({
    mutationFn: async ({ type, name }: { type: 'Pagar' | 'Receber'; name: string }) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { error } = await supabase.from('categories').insert({ user_id: user.id, type, name })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const renameCategory = useMutation({
    mutationFn: async ({ id, name, oldName, type }: { id: string; name: string; oldName: string; type: 'Pagar' | 'Receber' }) => {
      const { error } = await supabase.from('categories').update({ name }).eq('id', id)
      if (error) throw error
      // Propaga o novo nome para transações existentes que usavam o nome antigo
      const { error: txError } = await supabase
        .from('transactions')
        .update({ category: name })
        .eq('type', type)
        .eq('category', oldName)
      if (txError) throw txError
    },
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  const categories = query.data ?? []
  return {
    categoriesPagar: categories.filter((c) => c.type === 'Pagar').map((c) => c.name),
    categoriesReceber: categories.filter((c) => c.type === 'Receber').map((c) => c.name),
    allCategories: categories,
    isLoading: query.isLoading,
    addCategory,
    deleteCategory,
    renameCategory,
  }
}
