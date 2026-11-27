import { useEffect, useState } from 'react'

/**
 * Opção "Ver vídeo" das Definições. Desligada por omissão: enquanto estiver
 * desligada, nenhum botão de vídeo aparece na app.
 */
const KEY = 'sonora:ver-video'
const EVENT = 'sonora:ver-video'

export const lerVideoAtivo = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const guardarVideoAtivo = (ativo: boolean): void => {
  try {
    localStorage.setItem(KEY, ativo ? '1' : '0')
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Estado da opção, partilhado entre as Definições e os botões de vídeo. */
export function useVideoAtivo(): [boolean, (ativo: boolean) => void] {
  const [ativo, setAtivo] = useState<boolean>(lerVideoAtivo)

  useEffect(() => {
    const sync = () => setAtivo(lerVideoAtivo())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [ativo, guardarVideoAtivo]
}
