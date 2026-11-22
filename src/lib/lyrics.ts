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

export type SyncedLine = { time: number; text: string }

/** Converte uma string de tempo LRC ([mm:ss.xx]) para segundos. */
const lrcTimeToSeconds = (time: string): number => {
  const [min, rest] = time.split(':')
  const [sec, cent] = rest.split('.')
  return (
    Number(min) * 60 +
    Number(sec) +
    (cent ? Number(`0.${cent}`) : 0)
  )
}

/**
 * Parseia letras sincronizadas no formato LRC e retorna um array de linhas ordenadas por tempo.
 * Formato esperado: [mm:ss.xx]texto da linha
 */
export const parseSyncedLyrics = (sync?: string): SyncedLine[] => {
  if (!sync) return []
  const lines: SyncedLine[] = []
  for (const raw of sync.split('\n')) {
    const match = raw.match(/^\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\](.*)$/)
    if (match) {
      lines.push({ time: lrcTimeToSeconds(match[1]), text: match[2].trim() })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

/**
 * Dado o tempo atual em segundos, retorna o índice da linha que deve estar ativa.
 * Retorna -1 se nenhuma linha estiver ativa ainda (ainda não chegou à primeira).
 */
export const getActiveLyricIndex = (lines: SyncedLine[], currentTime: number): number => {
  if (!lines.length) return -1
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].time) active = i
    else break
  }
  return active
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
