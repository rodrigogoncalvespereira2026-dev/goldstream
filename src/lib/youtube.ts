import { registerTracks, type Track } from './catalog'

const API = 'https://www.googleapis.com/youtube/v3'

/* ---------------- chave de API ---------------- */

/** Chave da API do YouTube (YouTube Data API v3) usada pela busca do app. */
export const YOUTUBE_API_KEY = 'AIzaSyDxHoaiSi6nTYeMKBgdt9Bj1IWto7KZOnA'

/* ---------------- player embutido ---------------- */

export type YTPlayer = {
  playVideo?: () => void
  pauseVideo?: () => void
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void
  setVolume?: (volume: number) => void
  getCurrentTime?: () => number
  getDuration?: () => number
  loadVideoById?: (videoId: string) => void
  destroy?: () => void
}

type YTEvent = { target: YTPlayer; data: number }

export type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string
      height?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: YTEvent) => void
        onStateChange?: (event: YTEvent) => void
        onError?: (event: YTEvent) => void
      }
    },
  ) => YTPlayer
}

type YouTubeWindow = Window & {
  YT?: YTNamespace
  onYouTubeIframeAPIReady?: () => void
}

let apiPromise: Promise<void> | null = null

export const getYT = (): YTNamespace | undefined => (window as YouTubeWindow).YT

export function loadYouTubeApi(): Promise<void> {
  const youtube = window as YouTubeWindow
  if (youtube.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise

  apiPromise = new Promise<void>((resolve, reject) => {
    const previous = youtube.onYouTubeIframeAPIReady
    youtube.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = () => reject(new Error('Não foi possível carregar o player do YouTube.'))
      document.head.appendChild(script)
    }

    window.setTimeout(() => {
      if (!youtube.YT?.Player) reject(new Error('O player do YouTube demorou para carregar.'))
    }, 15000)
  })

  return apiPromise
}

/* ---------------- busca ---------------- */

type YTThumbnail = { url?: string; width?: number; height?: number }

type YTSnippet = {
  title?: string
  channelTitle?: string
  publishedAt?: string
  thumbnails?: Record<string, YTThumbnail | undefined>
}

type YTSearchItem = { id?: { videoId?: string }; snippet?: YTSnippet }

type YTVideoItem = {
  id?: string
  snippet?: YTSnippet
  contentDetails?: { duration?: string }
  status?: { embeddable?: boolean; privacyStatus?: string }
}

type YTError = { error?: { message?: string; errors?: { reason?: string }[] } }

const DECODE_MAP: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
}
const ENTITY_PATTERN = /&(amp|quot|#39|apos|lt|gt);|&#(\d+);/g

export const decodeEntity = (value: string): string =>
  value.replace(ENTITY_PATTERN, (match, name: string | undefined, code: string | undefined) => {
    if (name && DECODE_MAP[`&${name};`]) return DECODE_MAP[`&${name};`]
    if (code) return String.fromCharCode(Number(code))
    return match
  })

const NOISE_PATTERN =
  /\s*[([][^)\]]*\b(official|oficial|clipe|videoclipe|video|vídeo|audio|áudio|lyric|lyrics|letra|legendado|tradução|traducao|visualizer|ao vivo|live|remaster\w*|hd|hq|4k|8k|performance)\b[^)\]]*[)\]]/gi

/** Tira do título o que é de vídeo (Official Video, Lyrics, Ao Vivo, 4K…) e sobra a música. */
export const songTitle = (raw: string): string =>
  decodeEntity(raw)
    .replace(NOISE_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–—|·]+$/g, '')
    .trim()

const deaccent = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Separa "Artista - Música" em música + artista, usando o canal como referência. */
export const songFields = (
  rawTitle: string,
  channel: string,
): { title: string; artist: string } => {
  const artist = decodeEntity(channel).replace(/\s*-\s*Topic$/, '').trim() || 'YouTube'
  let title = songTitle(rawTitle)
  const parts = title.split(/\s+[-–—]\s+/)
  if (parts.length > 1 && parts[0].length > 1 && deaccent(artist).includes(deaccent(parts[0]))) {
    title = parts.slice(1).join(' - ')
  }
  return { title: title || songTitle(rawTitle) || artist, artist }
}

const parseIsoDuration = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return undefined
  const [, days, hours, minutes, seconds] = match
  const total =
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  return total > 0 ? total : undefined
}

const apiError = async (response: Response): Promise<Error> => {
  let reason = ''
  let message = `A API do YouTube respondeu ${response.status}.`
  try {
    const payload = (await response.json()) as YTError
    reason = payload.error?.errors?.[0]?.reason ?? ''
    message = payload.error?.message ?? message
  } catch {
    /* resposta sem JSON */
  }
  if (reason === 'quotaExceeded' || response.status === 429) {
    return new Error('Cota diária da API do YouTube esgotada. Tente novamente amanhã.')
  }
  if (reason === 'keyInvalid' || reason === 'badRequest' || response.status === 400) {
    return new Error('Chave de API do YouTube inválida. Confira a chave salva.')
  }
  if (reason === 'ipRefererBlocked' || reason === 'forbidden') {
    return new Error('A chave não permite chamadas do navegador. Libere o acesso nas restrições da chave.')
  }
  return new Error(message)
}

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/

/** Aceita link do YouTube (watch, youtu.be, shorts, embed, live) ou o id do vídeo. */
export const parseYouTubeLink = (value: string): string | null => {
  const input = value.trim()
  if (!input) return null
  if (VIDEO_ID.test(input)) return input

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && VIDEO_ID.test(id) ? id : null
  }

  if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const fromQuery = url.searchParams.get('v')
    if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery
    const parts = url.pathname.split('/').filter(Boolean)
    const candidate =
      parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' ? parts[1] : undefined
    return candidate && VIDEO_ID.test(candidate) ? candidate : null
  }

  return null
}

type NoembedResponse = {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

/** Monta uma faixa tocável a partir de um link do YouTube (não precisa de chave de API). */
export async function trackFromYouTubeLink(link: string): Promise<Track | null> {
  const videoId = parseYouTubeLink(link)
  if (!videoId) return null

  let title = 'Vídeo do YouTube'
  let artist = 'YouTube'
  let cover = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

  try {
    const response = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    )
    if (response.ok) {
      const meta = (await response.json()) as NoembedResponse
      if (meta.title) title = decodeEntity(meta.title)
      if (meta.author_name) artist = meta.author_name
      if (meta.thumbnail_url) cover = meta.thumbnail_url
    }
  } catch {
    /* metadados são opcionais: o vídeo toca mesmo sem eles */
  }

  const track: Track = {
    id: `yt:${videoId}`,
    title,
    artist,
    albumId: 'youtube',
    albumTitle: artist,
    cover,
    src: '',
    genre: 'YouTube',
    year: 0,
    position: 0,
    duration: 0,
    external: true,
    provider: 'youtube',
    videoId,
  }

  registerTracks([track])
  return track
}

const cache = new Map<string, Track[]>()
const keylessCache = new Map<string, Track[]>()

/* ---------------- busca sem chave (qualquer artista, sem cota) ---------------- */

type PipedSearchItem = {
  url?: string
  type?: string
  title?: string
  uploaderName?: string
  duration?: number
}

/** Instâncias públicas do Piped: respondem com CORS liberado e não pedem chave. */
const PIPED_HOSTS = ['api.piped.private.coffee', 'pipedapi.ducks.party']
const WATCH_ID = /[?&]v=([a-zA-Z0-9_-]{11})/

const trackFromPiped = (item: PipedSearchItem): Track | null => {
  if (item.type && item.type !== 'stream') return null
  const videoId = WATCH_ID.exec(item.url ?? '')?.[1]
  if (!videoId) return null
  const seconds = Number(item.duration ?? 0)
  if (!Number.isFinite(seconds) || seconds < 45) return null
  if (!(item.title ?? '').trim()) return null
  const uploader = decodeEntity(item.uploaderName ?? 'YouTube').trim() || 'YouTube'
  const song = songFields(item.title ?? '', uploader)

  return {
    id: `yt:${videoId}`,
    title: song.title,
    artist: song.artist,
    albumId: 'youtube',
    albumTitle: 'YouTube',
    cover: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    src: '',
    genre: 'YouTube',
    year: 0,
    position: 0,
    duration: Math.round(seconds),
    external: true,
    provider: 'youtube',
    videoId,
  }
}

async function searchYouTubeWithoutKey(query: string, signal?: AbortSignal): Promise<Track[]> {
  let lastError: unknown = null

  for (const host of PIPED_HOSTS) {
    try {
      const params = new URLSearchParams({ q: query, filter: 'music_songs' })
      const response = await fetch(`https://${host}/search?${params.toString()}`, { signal })
      if (!response.ok) throw new Error(`A busca pública respondeu ${response.status}.`)
      const payload = (await response.json()) as { items?: PipedSearchItem[] }
      const tracks = (payload.items ?? [])
        .map(trackFromPiped)
        .filter((track): track is Track => Boolean(track))
      if (tracks.length) return tracks
      lastError = new Error('A busca pública não devolveu faixas.')
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Busca do YouTube indisponível.')
}

/**
 * Busca músicas completas de qualquer artista na busca pública do YouTube (sem chave e sem
 * cota) e só recorre à API oficial quando as instâncias públicas não respondem.
 */
export async function searchYouTubeSongs(
  term: string,
  apiKey: string,
  signal?: AbortSignal,
  limit = 20,
): Promise<Track[]> {
  const query = term.trim()
  if (query.length < 2) return []

  const cacheKey = `${limit}:${query.toLowerCase()}`
  const cached = keylessCache.get(cacheKey)
  if (cached) return cached

  let tracks: Track[]
  try {
    tracks = await searchYouTubeWithoutKey(query, signal)
  } catch (error) {
    if (signal?.aborted) throw error
    tracks = await searchYouTube(query, apiKey, signal, limit)
  }

  const result = tracks.slice(0, limit)
  registerTracks(result)
  if (keylessCache.size > 40) keylessCache.delete(keylessCache.keys().next().value as string)
  keylessCache.set(cacheKey, result)
  return result
}

/** Busca músicas completas no YouTube (vídeos de música) e devolve faixas tocáveis. */
export async function searchYouTube(
  term: string,
  apiKey: string,
  signal?: AbortSignal,
  limit = 20,
): Promise<Track[]> {
  const query = term.trim()
  if (query.length < 2 || !apiKey) return []

  const cacheKey = `${limit}:${query.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    maxResults: String(limit),
    q: query,
    key: apiKey,
  })

  const searchResponse = await fetch(`${API}/search?${searchParams.toString()}`, { signal })
  if (!searchResponse.ok) throw await apiError(searchResponse)
  const searchPayload = (await searchResponse.json()) as { items?: YTSearchItem[] }

  const candidates = (searchPayload.items ?? []).filter(
    (item): item is YTSearchItem & { id: { videoId: string } } => Boolean(item.id?.videoId),
  )
  if (!candidates.length) return []

  const detailParams = new URLSearchParams({
    part: 'snippet,contentDetails,status',
    id: candidates.map((item) => item.id.videoId).join(','),
    key: apiKey,
  })

  const detailResponse = await fetch(`${API}/videos?${detailParams.toString()}`, { signal })
  if (!detailResponse.ok) throw await apiError(detailResponse)
  const detailPayload = (await detailResponse.json()) as { items?: YTVideoItem[] }
  const details = new Map((detailPayload.items ?? []).map((item) => [item.id ?? '', item]))

  const tracks: Track[] = []
  for (const candidate of candidates) {
    const detail = details.get(candidate.id.videoId)
    const snippet = detail?.snippet ?? candidate.snippet
    if (!snippet?.title) continue
    // Clipes oficiais costumam bloquear incorporação: não adianta listar o que não toca.
    if (detail?.status && detail.status.embeddable !== true) continue
    if (detail?.status?.privacyStatus && detail.status.privacyStatus !== 'public') continue
    const seconds = parseIsoDuration(detail?.contentDetails?.duration)
    if (seconds && seconds < 45) continue

    const channel = decodeEntity(snippet.channelTitle ?? 'YouTube')
    const song = songFields(snippet.title, channel)
    tracks.push({
      id: `yt:${candidate.id.videoId}`,
      title: song.title,
      artist: song.artist,
      albumId: 'youtube',
      albumTitle: 'YouTube',
      cover: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? '',
      src: '',
      genre: 'YouTube',
      year: snippet.publishedAt ? Number(snippet.publishedAt.slice(0, 4)) : 0,
      position: 0,
      duration: seconds,
      external: true,
      provider: 'youtube',
      videoId: candidate.id.videoId,
    })
  }

  registerTracks(tracks)
  if (cache.size > 40) cache.delete(cache.keys().next().value as string)
  cache.set(cacheKey, tracks)
  return tracks
}
