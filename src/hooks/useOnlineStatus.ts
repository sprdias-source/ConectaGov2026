import { useEffect, useState } from 'react'

/**
 * Monitora se o navegador está online/offline. Isso não garante que o
 * Supabase está alcançável (pode estar "online" na rede local mas sem
 * rota até a internet), mas cobre o caso mais comum em campo: perda de
 * sinal de celular ou Wi-Fi instável - situação real para quem usa o
 * sistema em deslocamento ou em prédios públicos com sinal ruim.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
