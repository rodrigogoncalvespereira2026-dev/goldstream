import type { Track } from './catalog'

/**
 * Letras vêm do LRCLIB, uma base aberta e sem chave de API (e com CORS aberto).
 * O resultado fica em memória para não voltar a pedir a mesma faixa.
 */
export type LyricsResult = {
  plain: string
  sync?: string
}

type LrclibEntry = {
  trackName?: string
  artistName?: string
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

const cache = new Map<string, LyricsResult | null>()

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const pickBest = (entries: LrclibEntry[], track: Track): LrclibEntry | null => {
  const title = normalize(track.title)
  const artist = normalize(track.artist)
  const valid = entries.filter((entry) => (entry.plainLyrics ?? '').trim().length > 0)
  if (!valid.length) return null

  const score = (entry: LrclibEntry) => {
    let points = 0
    if (normalize(entry.trackName ?? '') === title) points += 4
    else if (normalize(entry.trackName ?? '').includes(title) || title.includes(normalize(entry.trackName ?? ''))) {
      points += 2
    }
    if (normalize(entry.artistName ?? '') === artist) points += 3
    else if (normalize(entry.artistName ?? '').includes(artist)) points += 1
    return points
  }

  return valid.sort((a, b) => score(b) - score(a))[0] ?? null
}

export async function fetchLyrics(track: Track, signal?: AbortSignal): Promise<LyricsResult | null> {
  const key = `${track.title}|${track.artist}`
  if (cache.has(key)) return cache.get(key) ?? null

  const queries = [
    `track_name=${encodeURIComponent(track.title)}&artist_name=${encodeURIComponent(track.artist)}`,
    `q=${encodeURIComponent(`${track.title} ${track.artist}`)}`,
    `q=${encodeURIComponent(track.title)}`,
  ]

  for (const query of queries) {
    try {
      const response = await fetch(`https://lrclib.net/api/search?${query}`, { signal })
      if (!response.ok) continue
      const entries = (await response.json()) as LrclibEntry[]
      if (!Array.isArray(entries) || !entries.length) continue
      const best = pickBest(entries, track)
      if (!best) continue
      const plain = (best.plainLyrics ?? '').trim()
      if (!plain) continue
      const result: LyricsResult = { plain, sync: best.syncedLyrics?.trim() || undefined }
      cache.set(key, result)
      return result
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }

  cache.set(key, null)
  return null
}
