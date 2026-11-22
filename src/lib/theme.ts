import { useEffect, useState } from 'react'

export type AccentId =
  | 'verde'
  | 'roxo'
  | 'azul'
  | 'ciano'
  | 'rosa'
  | 'laranja'
  | 'vermelho'
  | 'amarelo'

export type Accent = { id: AccentId; name: string; color: string; hover: string; ink: string }

export const ACCENTS: Accent[] = [
  { id: 'verde', name: 'Verde', color: '#1ed760', hover: '#1fdf64', ink: '#04140a' },
  { id: 'roxo', name: 'Roxo', color: '#a855f7', hover: '#b975f9', ink: '#14061f' },
  { id: 'azul', name: 'Azul', color: '#3b82f6', hover: '#5b96f8', ink: '#04101f' },
  { id: 'ciano', name: 'Ciano', color: '#22d3ee', hover: '#4adcf2', ink: '#03151a' },
  { id: 'rosa', name: 'Rosa', color: '#ec4899', hover: '#f063a9', ink: '#1f0413' },
  { id: 'laranja', name: 'Laranja', color: '#f97316', hover: '#fa8230', ink: '#1f0a02' },
  { id: 'vermelho', name: 'Vermelho', color: '#ef4444', hover: '#f25a5a', ink: '#1f0404' },
  { id: 'amarelo', name: 'Amarelo', color: '#eab308', hover: '#f2c227', ink: '#1a1502' },
]

const KEY = 'sonora:accent'
const EVENT = 'sonora:accent'

export const accentById = (id: string): Accent =>
  ACCENTS.find((item) => item.id === id) ?? ACCENTS[0]

export const readAccent = (): AccentId => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw && ACCENTS.some((item) => item.id === raw) ? (raw as AccentId) : 'verde'
  } catch {
    return 'verde'
  }
}

export const applyAccent = (id: AccentId): void => {
  const accent = accentById(id)
  const root = document.documentElement
  root.style.setProperty('--accent', accent.color)
  root.style.setProperty('--accent-hover', accent.hover)
  root.style.setProperty('--accent-ink', accent.ink)
}

export const saveAccent = (id: AccentId): void => {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage indisponível */
  }
  applyAccent(id)
  window.dispatchEvent(new Event(EVENT))
}

export function useAccent(): [AccentId, (id: AccentId) => void] {
  const [id, setId] = useState<AccentId>(readAccent)

  useEffect(() => {
    const sync = () => setId(readAccent())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [id, saveAccent]
}
