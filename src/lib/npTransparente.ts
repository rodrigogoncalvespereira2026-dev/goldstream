import { useEffect, useState } from 'react'

/**
 * Opção "Fundo transparente no player" das Definições. Desligada por omissão:
 * desligada, o ecrã "Agora tocando" fica escuro como sempre; ligada, mostra por
 * trás o fundo da tela escolhido em Aparência → Fundos da tela.
 */
const KEY = 'sonora:np-transparente'
const EVENT = 'sonora:np-transparente'

export const lerNpTransparente = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const guardarNpTransparente = (ativo: boolean): void => {
  try {
    localStorage.setItem(KEY, ativo ? '1' : '0')
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useNpTransparente(): [boolean, (ativo: boolean) => void] {
  const [ativo, setAtivo] = useState<boolean>(lerNpTransparente)

  useEffect(() => {
    const sync = () => setAtivo(lerNpTransparente())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [ativo, guardarNpTransparente]
}
