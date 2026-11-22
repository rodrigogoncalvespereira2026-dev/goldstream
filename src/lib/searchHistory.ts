import { useEffect, useState } from 'react'

const KEY = 'sonora:searches'
const EVENT = 'sonora:searches'
const LIMIT = 10

export const readSearches = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
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

/** Guarda a pesquisa, tirando as versões anteriores que sejam só um começo dela. */
export const pushSearch = (query: string): void => {
  const text = query.trim()
  if (text.length < 2) return
  const lower = text.toLowerCase()
  const rest = readSearches().filter(
    (item) => item.toLowerCase() !== lower && !lower.startsWith(item.toLowerCase()),
  )
  write([text, ...rest].slice(0, LIMIT))
}

export const clearSearches = (): void => write([])

export function useSearchHistory(): [string[], (query: string) => void, () => void] {
  const [list, setList] = useState<string[]>(readSearches)

  useEffect(() => {
    const sync = () => setList(readSearches())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [list, pushSearch, clearSearches]
}
