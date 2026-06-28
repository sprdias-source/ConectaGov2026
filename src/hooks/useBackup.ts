import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuditLog } from './useAuditLog'

const TABLES = [
  'clients', 'biddings', 'financial_accounts', 'categories', 'empenhos',
  'transactions', 'employees', 'contracts', 'receipts', 'attached_files',
] as const

export function useBackup() {
  const [isExporting, setIsExporting] = useState(false)
  const { logEvent } = useAuditLog()

  const exportBackup = async () => {
    setIsExporting(true)
    try {
      const payload: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        version: '2.0',
      }

      for (const table of TABLES) {
        const { data, error } = await supabase.from(table).select('*')
        if (error) throw error
        payload[table] = data
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conectagov-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      logEvent('Cópia de Segurança', 'Exportou backup completo de todos os dados do sistema')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' }
    } finally {
      setIsExporting(false)
    }
  }

  return { exportBackup, isExporting }
}
