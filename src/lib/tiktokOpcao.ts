import { useEffect, useState } from 'react'

/**
 * Opção "Músicas do TikTok" das Definições. Ligada por omissão: desligada, a
 * Buscar deixa de mostrar a caixa do link e o som do próprio vídeo.
 */
const KEY = 'sonora:mostrar-tiktok'
const EVENT = 'sonora:mostrar-tiktok'

export const lerTikTokAtivo = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export const guardarTikTokAtivo = (ativo: boolean): void => {
  try {
    localStorage.setItem(KEY, ativo ? '1' : '0')
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Estado da opção, partilhado entre as Definições e a Buscar. */
export function useTikTokAtivo(): [boolean, (ativo: boolean) => void] {
  const [ativo, setAtivo] = useState<boolean>(lerTikTokAtivo)

  useEffect(() => {
    const sync = () => setAtivo(lerTikTokAtivo())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [ativo, guardarTikTokAtivo]
}
