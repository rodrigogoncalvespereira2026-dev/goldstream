import { useEffect, useState } from 'react'

export type BackgroundId =
  | 'none'
  | 'aurora'
  | 'sunset'
  | 'ocean'
  | 'neon'
  | 'stars'
  | 'vinyl'

export type Background = { id: BackgroundId; name: string; note: string }

export const BACKGROUNDS: Background[] = [
  { id: 'none', name: 'Escuro liso', note: 'O fundo de sempre' },
  { id: 'aurora', name: 'Aurora', note: 'Verdes a ondular devagar' },
  { id: 'sunset', name: 'Pôr do sol', note: 'Laranja e rosa em movimento' },
  { id: 'ocean', name: 'Oceano', note: 'Azuis profundos a correr' },
  { id: 'neon', name: 'Néon', note: 'Roxo e ciano a pulsar' },
  { id: 'stars', name: 'Estrelas', note: 'Céu escuro a cintilar' },
  { id: 'vinyl', name: 'Vinil', note: 'Disco a girar ao fundo' },
]

const KEY = 'sonora:background'
const EVENT = 'sonora:background'

export const isBackgroundId = (value: string): value is BackgroundId =>
  BACKGROUNDS.some((item) => item.id === value)

export const readBackground = (): BackgroundId => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw && isBackgroundId(raw) ? raw : 'none'
  } catch {
    return 'none'
  }
}

export const saveBackground = (id: BackgroundId): void => {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Fundo escolhido, partilhado entre as definições, a página e a moldura da app. */
export function useBackground(): [BackgroundId, (id: BackgroundId) => void] {
  const [id, setId] = useState<BackgroundId>(readBackground)

  useEffect(() => {
    const sync = () => setId(readBackground())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [id, saveBackground]
}
