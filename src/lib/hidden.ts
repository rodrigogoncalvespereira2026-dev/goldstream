import { useEffect, useState } from 'react'

/**
 * Coisas do catálogo que o utilizador tirou da biblioteca (playlists e álbuns
 * da goldenstream). Ficam escondidas neste dispositivo; as playlists dele
 * continuam a ser apagadas a sério, isto é só para o que não é editável.
 */
const KEY = 'sonora:hidden'
const EVENT = 'sonora:hidden'

export const readHidden = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

const write = (list: string[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

export const hideItem = (id: string): void => {
  const list = readHidden()
  if (!list.includes(id)) write([...list, id])
}

export const unhideAll = (): void => write([])

/** Lista escondida, partilhada entre a biblioteca e o aviso de "mostrar tudo". */
export function useHidden(): [string[], (id: string) => void, () => void] {
  const [hidden, setHidden] = useState<string[]>(readHidden)

  useEffect(() => {
    const sync = () => setHidden(readHidden())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [hidden, hideItem, unhideAll]
}
