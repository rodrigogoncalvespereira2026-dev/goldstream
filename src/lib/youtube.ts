import { Capacitor, registerPlugin } from '@capacitor/core'
import { registerTracks, type Track } from './catalog'

const API = 'https://www.googleapis.com/youtube/v3'

/* ---------------- chave de API ---------------- */

/** Chave da API do YouTube (YouTube Data API v3) usada pela busca do app. */
export const YOUTUBE_API_KEY = 'AIzaSyDxHoaiSi6nTYeMKBgdt9Bj1IWto7KZOnA'

/* ---------------- player embutido ---------------- */

export type YTPlayer = {
  playVideo?: () => void
  pauseVideo?: () => void
  stopVideo?: () => void
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void
  setVolume?: (volume: number) => void
  getCurrentTime?: () => number
  getDuration?: () => number
  loadVideoById?: (videoId: string) => void
  cueVideoById?: (videoId: string) => void
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

const API_SCRIPT = 'https://www.youtube.com/iframe_api'

const removeApiScript = (): void => {
  document.querySelector(`script[src="${API_SCRIPT}"]`)?.remove()
}

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

    if (!document.querySelector(`script[src="${API_SCRIPT}"]`)) {
      const script = document.createElement('script')
      script.src = API_SCRIPT
      script.async = true
      script.onerror = () => {
        removeApiScript()
        reject(new Error('Não foi possível carregar o player do YouTube.'))
      }
      document.head.appendChild(script)
    }

    window.setTimeout(() => {
      if (youtube.YT?.Player) return
      removeApiScript()
      reject(new Error('O player do YouTube demorou para carregar.'))
    }, 15000)
  }).catch((error: unknown) => {
    // Sem limpar a promise, um bloqueio momentâneo impediria novas tentativas na sessão.
    apiPromise = null
    throw error
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

  if (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  ) {
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
const PIPED_HOSTS = ['api.piped.private.coffee', 'pipedapi.ducks.party', 'pipedapi.adminforge.de']
const WATCH_ID = /[?&]v=([a-zA-Z0-9_-]{11})/

/* ---------------- áudio direto (para tocar em segundo plano) ---------------- */

type PipedAudioStream = { url?: string; mimeType?: string; bitrate?: number }
type PipedStreamsPayload = { audioStreams?: PipedAudioStream[] }

const audioStreamCache = new Map<string, string>()
/** Faixas que falharam há pouco: evita voltar a pedir o áudio a cada tentativa. */
const audioFailureCache = new Map<string, number>()

type NativeSearchItem = {
  videoId?: string
  title?: string
  uploader?: string
  duration?: number
  thumbnail?: string
}

type YouTubeAudioPlugin = {
  resolve(options: { videoId: string }): Promise<{ url: string; mimeType?: string }>
  search(options: { query: string; limit?: number }): Promise<{ items?: NativeSearchItem[] }>
}

/** Extração nativa (NewPipeExtractor) — só existe dentro do APK. */
const YouTubeAudio = registerPlugin<YouTubeAudioPlugin>('YouTubeAudio')

/**
 * Devolve um URL de áudio progressivo do vídeo. Com ele a faixa toca no player nativo do
 * sistema, que continua com o ecrã bloqueado — o iframe do YouTube pausa quando a app sai
 * de primeiro plano.
 */
export async function resolveYouTubeAudio(
  videoId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const cached = audioStreamCache.get(videoId)
  if (cached) return cached

  const failedAt = audioFailureCache.get(videoId)
  if (failedAt && Date.now() - failedAt < 90_000) return null

  // No telemóvel a extração é local: as APIs públicas deixaram de devolver o áudio.
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('YouTubeAudio')) {
    // Duas tentativas: a primeira pode apanhar uma resposta instável do YouTube.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const resolved = await YouTubeAudio.resolve({ videoId })
        if (resolved?.url) {
          audioFailureCache.delete(videoId)
          audioStreamCache.set(videoId, resolved.url)
          return resolved.url
        }
      } catch {
        /* nova tentativa, depois as instâncias públicas */
      }
      if (attempt === 0) await new Promise((done) => setTimeout(done, 600))
    }
  }

  // No telemóvel não vale a pena esperar pelas instâncias públicas: devolvem 404 e
  // demoram. Sem áudio nativo, a app passa já para o player do YouTube.
  if (Capacitor.isNativePlatform()) {
    audioFailureCache.set(videoId, Date.now())
    return null
  }

  for (const host of PIPED_HOSTS) {
    try {
      const response = await fetch(`https://${host}/streams/${videoId}`, { signal })
      if (!response.ok) continue
      const payload = (await response.json()) as PipedStreamsPayload
      const streams = (payload.audioStreams ?? []).filter((item) => Boolean(item.url))
      if (!streams.length) continue
      streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
      const url = streams[0].url
      if (!url) continue
      audioStreamCache.set(videoId, url)
      return url
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }

  audioFailureCache.set(videoId, Date.now())
  return null
}

/* ---------------- relevância ---------------- */

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const NOISE = /(\d+\s*(horas?|hours?|h|min|minutes?))|compilation|compilac|playlist|mega ?mix|\bmix\b|best of|top \d+|\d+ ?h\b/

const relevanceScore = (query: string, track: Track): number => {
  const q = normalizeText(query)
  if (!q) return 0
  const title = normalizeText(track.title)
  const artist = normalizeText(track.artist)
  const tokens = q.split(' ').filter(Boolean)
  if (!tokens.length) return 0

  let score = 0
  if (title === q) score += 140
  else if (title.startsWith(q)) score += 90
  else if (title.includes(q)) score += 55
  if (artist === q) score += 100
  else if (artist.includes(q)) score += 55

  const matched = tokens.filter((token) => title.includes(token) || artist.includes(token)).length
  score += (matched / tokens.length) * 45

  // A música pedida deve ficar acima de compilações, mixes e horas de música.
  if (NOISE.test(title)) score -= 30
  if (!tokens.every((token) => title.includes(token) || artist.includes(token))) score -= 15
  if (title.length > 90) score -= 10
  return score
}

/** Põe no topo o resultado que mais se parece com o que foi escrito. */
export function rankByRelevance(query: string, tracks: Track[]): Track[] {
  return tracks
    .map((track, index) => ({ track, index, score: relevanceScore(query, track) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.track)
}

/** Falha depressa em vez de deixar a busca presa se o nativo não responder. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Tempo esgotado.')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Busca no próprio YouTube a partir do telemóvel (NewPipe), a mesma fonte que toca o áudio. */
async function searchYouTubeNative(query: string, limit: number): Promise<Track[]> {
  const payload = await withTimeout(YouTubeAudio.search({ query, limit }), 15000)
  const tracks: Track[] = []

  for (const item of payload?.items ?? []) {
    const videoId = (item.videoId ?? '').trim()
    const title = decodeEntity(item.title ?? '').trim()
    if (!videoId || !title) continue
    const raw = Number(item.duration ?? 0)
    const seconds = Number.isFinite(raw) && raw > 0 ? raw : 0
    if (seconds > 0 && seconds < 20) continue
    // Transmissões em direto não dão áudio guardado: apareciam na lista e não tocavam.
    if (seconds === 0 && /\b(live|ao vivo|24\/7)\b/i.test(title)) continue
    const song = songFields(title, decodeEntity(item.uploader ?? 'YouTube'))
    tracks.push({
      id: `yt:${videoId}`,
      title: song.title,
      artist: song.artist,
      albumId: 'youtube',
      albumTitle: 'YouTube',
      cover: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      src: '',
      genre: 'YouTube',
      year: 0,
      position: 0,
      duration: seconds,
      external: true,
      provider: 'youtube',
      videoId,
    })
  }

  return tracks
}

const trackFromPiped = (item: PipedSearchItem): Track | null => {
  if (item.type && item.type !== 'stream') return null
  const videoId = WATCH_ID.exec(item.url ?? '')?.[1]
  if (!videoId) return null
  const raw = Number(item.duration ?? 0)
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 0
  // Só descarta clipes muito curtos; duração desconhecida não é motivo para esconder.
  if (seconds > 0 && seconds < 20) return null
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

/** Uma pesquisa do Piped com um filtro (música, vídeo, tudo). */
async function pipedSearch(
  host: string,
  query: string,
  filter: string,
  signal?: AbortSignal,
): Promise<Track[]> {
  const params = new URLSearchParams({ q: query, filter })
  const response = await fetch(`https://${host}/search?${params.toString()}`, { signal })
  if (!response.ok) throw new Error(`A busca pública respondeu ${response.status}.`)
  const payload = (await response.json()) as { items?: PipedSearchItem[] }
  return (payload.items ?? []).map(trackFromPiped).filter((track): track is Track => Boolean(track))
}

/**
 * Junta vários filtros (músicas, vídeos e tudo) para não esconder resultados que o YouTube
 * não classifica como "música" — era a razão de faltar tanta coisa na busca.
 */
async function searchYouTubeWithoutKey(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<Track[]> {
  let lastError: unknown = null

  for (const host of PIPED_HOSTS) {
    try {
      const batches = await Promise.all(
        ['music_songs', 'videos', 'all'].map((filter) =>
          pipedSearch(host, query, filter, signal).catch(() => [] as Track[]),
        ),
      )

      const seen = new Set<string>()
      const merged: Track[] = []
      for (const batch of batches) {
        for (const track of batch) {
          if (seen.has(track.id)) continue
          seen.add(track.id)
          merged.push(track)
        }
      }

      if (merged.length) return merged.slice(0, limit)
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
  limit = 30,
): Promise<Track[]> {
  const query = term.trim()
  if (query.length < 2) return []

  const cacheKey = `${limit}:${query.toLowerCase()}`
  const cached = keylessCache.get(cacheKey)
  if (cached) return cached

  let tracks: Track[] = []

  // No telemóvel a busca é feita no próprio YouTube: é a lista completa e na ordem certa.
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('YouTubeAudio')) {
    try {
      tracks = await searchYouTubeNative(query, Math.max(limit, 30))
    } catch {
      tracks = []
    }
  }

  if (!tracks.length) {
    try {
      tracks = await searchYouTubeWithoutKey(query, limit, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      tracks = await searchYouTube(query, apiKey, signal, limit)
    }
  }

  // Se a busca pública veio pobre, completa com a API oficial (sem filtro de categoria).
  if (tracks.length < 8 && apiKey) {
    try {
      const extra = await searchYouTube(query, apiKey, signal, limit)
      const seen = new Set(tracks.map((track) => track.id))
      for (const track of extra) {
        if (!seen.has(track.id)) tracks.push(track)
      }
    } catch {
      /* fica com o que já veio */
    }
  }

  const result = rankByRelevance(query, tracks).slice(0, limit)
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

  // Sem videoCategoryId: muita música está fora da categoria 10 e o filtro escondia-a.
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
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
    // O áudio é extraído no telemóvel, por isso vídeos sem incorporação também tocam.
    if (detail?.status?.privacyStatus && detail.status.privacyStatus !== 'public') continue
    const seconds = parseIsoDuration(detail?.contentDetails?.duration)
    if (seconds && seconds < 20) continue

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
