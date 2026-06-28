import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromEmployeeRow, toEmployeeInsert } from '../lib/mappers'
import type { Employee } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['employees']

export function useEmployees() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data.map(fromEmployeeRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addEmployee = useMutation({
    mutationFn: async (employee: Partial<Employee>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('employees')
        .insert(toEmployeeInsert(employee, user.id))
        .select()
        .single()
      if (error) throw error
      return fromEmployeeRow(data)
    },
    onSuccess: (created) => {
      invalidate()
      logEvent('Contratou Colaborador', `Adicionou "${created.name}" (${created.role ?? created.paymentType}) ao quadro`)
    },
  })

  const updateEmployee = useMutation({
    mutationFn: async (employee: Employee) => {
      const { data, error } = await supabase
        .from('employees')
        .update(toEmployeeInsert(employee, employee.userId))
        .eq('id', employee.id)
        .select()
        .single()
      if (error) throw error
      return fromEmployeeRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Editou Colaborador', `Atualizou dados de "${updated.name}"`)
    },
  })

  const deleteEmployee = useMutation({
    mutationFn: async (employee: Employee) => {
      const { error } = await supabase.from('employees').delete().eq('id', employee.id)
      if (error) throw error
      return employee
    },
    onSuccess: (deleted) => {
      invalidate()
      logEvent('Removeu Colaborador', `Removeu "${deleted.name}" do quadro de colaboradores`)
    },
  })

  return {
    employees: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addEmployee,
    updateEmployee,
    deleteEmployee,
  }
}
