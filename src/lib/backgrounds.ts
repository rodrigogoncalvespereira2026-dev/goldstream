import { useEffect, useState } from 'react'

export type BackgroundId =
  | 'none'
  | 'aurora'
  | 'sunset'
  | 'ocean'
  | 'neon'
  | 'stars'
  | 'vinyl'
  | 'lava'
  | 'forest'
  | 'rose'
  | 'galaxy'
  | 'matrix'
  | 'bokeh'
  | 'mint'
  | 'dusk'
  | 'desert'
  | 'ice'
  | 'sakura'
  | 'rain'
  | 'gold'

export type Background = { id: BackgroundId; name: string; note: string }

export const BACKGROUNDS: Background[] = [
  { id: 'none', name: 'Escuro liso', note: 'O fundo de sempre' },
  { id: 'aurora', name: 'Aurora', note: 'Verdes a ondular devagar' },
  { id: 'sunset', name: 'Pôr do sol', note: 'Laranja e rosa em movimento' },
  { id: 'ocean', name: 'Oceano', note: 'Azuis profundos a correr' },
  { id: 'neon', name: 'Néon', note: 'Roxo e ciano a pulsar' },
  { id: 'stars', name: 'Estrelas', note: 'Céu escuro a cintilar' },
  { id: 'vinyl', name: 'Vinil', note: 'Disco a girar ao fundo' },
  { id: 'lava', name: 'Lava', note: 'Vermelhos quentes a respirar' },
  { id: 'forest', name: 'Floresta', note: 'Verdes fundos e calmos' },
  { id: 'rose', name: 'Rosa', note: 'Rosa e violeta suaves' },
  { id: 'galaxy', name: 'Galáxia', note: 'Nebulosa roxa com estrelas' },
  { id: 'matrix', name: 'Código', note: 'Chuva verde a descer' },
  { id: 'bokeh', name: 'Bokeh', note: 'Luzes soltas a flutuar' },
  { id: 'mint', name: 'Menta', note: 'Verde-água fresco e calmo' },
  { id: 'dusk', name: 'Crepúsculo', note: 'Roxo a virar laranja' },
  { id: 'desert', name: 'Deserto', note: 'Terracota com sol baixo' },
  { id: 'ice', name: 'Gelo', note: 'Azuis frios e vidro fosco' },
  { id: 'sakura', name: 'Cerejeira', note: 'Pétalas cor-de-rosa a cair' },
  { id: 'rain', name: 'Chuva', note: 'Riscos finos a descer' },
  { id: 'gold', name: 'Ouro', note: 'Dourado com brilho a passar' },
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
