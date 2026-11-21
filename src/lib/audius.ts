import { registerTracks, type Track } from './catalog'
import { FALLBACK_COVER } from '../components/CoverImage'

const HOSTS = [
  'https://api.audius.co',
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
]

const APP_NAME = 'Sonora'

type AudiusArtwork = Record<string, string | string[] | undefined>

type AudiusTrack = {
  id: string
  title: string
  duration?: number
  genre?: string
  is_streamable?: boolean
  is_delete?: boolean
  release_date?: string
  artwork?: AudiusArtwork
  user?: { name?: string; handle?: string }
}

type AudiusResponse = { data?: AudiusTrack[] }

const cache = new Map<string, Track[]>()
let activeHost: string | null = null

const pickArtwork = (artwork: AudiusArtwork | undefined): string => {
  if (!artwork) return FALLBACK_COVER
  const candidate =
    artwork['480x480'] ?? artwork['150x150'] ?? artwork['1000x1000'] ?? artwork.mirrors
  return typeof candidate === 'string' && candidate.startsWith('http') ? candidate : FALLBACK_COVER
}

const toTrack = (song: AudiusTrack, host: string): Track => {
  const artist = song.user?.name ?? 'Artista Audius'
  return {
    id: `audius:${song.id}`,
    title: song.title,
    artist,
    albumId: `audius:artist:${song.user?.handle ?? song.id}`,
    albumTitle: artist,
    cover: pickArtwork(song.artwork),
    src: `${host}/v1/tracks/${song.id}/stream?app_name=${APP_NAME}`,
    genre: song.genre ?? 'Música',
    year: song.release_date ? Number(song.release_date.slice(0, 4)) : 0,
    position: 0,
    duration: typeof song.duration === 'number' && song.duration > 0 ? song.duration : undefined,
    external: true,
  }
}

async function fetchFrom(host: string, term: string, limit: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    query: term,
    app_name: APP_NAME,
    limit: String(limit),
  })
  const response = await fetch(`${host}/v1/tracks/search?${params.toString()}`, { signal })
  if (!response.ok) throw new Error(`Audius respondeu ${response.status}.`)
  const payload = (await response.json()) as AudiusResponse
  return { host, results: payload.data ?? [] }
}

/**
 * Busca faixas inteiras (não prévias) no catálogo livre do Audius.
 * São artistas independentes: hits de grandes gravadoras não fazem parte dele.
 */
export async function searchFullSongs(
  term: string,
  signal?: AbortSignal,
  limit = 20,
): Promise<Track[]> {
  const key = term.trim().toLowerCase()
  if (key.length < 2) return []

  const cached = cache.get(key)
  if (cached) return cached

  const hosts = activeHost ? [activeHost, ...HOSTS] : HOSTS
  let lastError: unknown = null

  for (const host of hosts) {
    try {
      const { host: usedHost, results } = await fetchFrom(host, key, limit, signal)
      activeHost = usedHost
      const tracks = results
        .filter((song) => song.id && song.title && song.is_streamable !== false && !song.is_delete)
        .map((song) => toTrack(song, usedHost))

      registerTracks(tracks)
      if (cache.size > 40) cache.delete(cache.keys().next().value as string)
      cache.set(key, tracks)
      return tracks
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Não foi possível falar com o Audius.')
}


