import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Capacitor } from '@capacitor/core'
import { NativeAudio } from '@capgo/capacitor-native-audio'
import { ALBUMS, TRACKS, getTrack, registerTracks, type Track } from './catalog'
import { shuffleArray } from './format'
import {
  forgetYouTubeAudioFailure,
  getYT,
  loadYouTubeApi,
  resolveYouTubeAudio,
  type YTPlayer,
} from './youtube'
import { addListening, addPlay, flushStats } from './stats'
import { trackPlaybackRequest } from './analytics'
import {
  assumirControlos,
  controlarRetomaNativa,
  isWebView,
  permitirPausa,
  scriptInjetado,
} from './platform'
import { logNative, logNativeCall, secsText } from './nativeLog'

type RepeatMode = 'off' | 'all' | 'one'

export type PlayerNotice = { message: string; retry?: boolean }

type PlayerValue = {
  current: Track | null
  isPlaying: boolean
  durations: Record<string, number>
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  liked: string[]
  recent: string[]
  /** Fila atual, pela ordem em que vai tocar. */
  queue: string[]
  /** Índice da faixa em curso dentro da fila. */
  queueIndex: number
  jumpTo: (id: string) => void
  removeFromQueue: (id: string) => void
  playQueue: (ids: string[], startId?: string) => void
  playTrack: (id: string) => void
  toggle: () => void
  next: () => void
  prev: () => void
  changeVolume: (value: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  toggleLike: (id: string) => void
  isLiked: (id: string) => boolean
  attachStage: (element: HTMLElement | null) => void
  playerNotice: PlayerNotice | null
  /** Vídeo aberto no ecrã "Ver vídeo" (pausa o áudio enquanto está aberto). */
  watchVideoId: string | null
  /** O vídeo aparece no lugar da capa do "agora tocando" (e não na folha por baixo). */
  watchInline: boolean
  openWatch: (videoId: string, options?: { inline?: boolean }) => void
  /** Volta ao áudio; `play` faz tocar mesmo que estivesse em pausa antes do vídeo. */
  closeWatch: (options?: { play?: boolean }) => void
  /** O vídeo na capa está a andar (a letra e a barra seguem-no). */
  watchPlaying: boolean
  /** Tempo do vídeo na capa: passa a ser o tempo da barra e da letra. */
  reportWatchTime: (seconds: number, duration?: number) => void
  reportWatchPlaying: (playing: boolean) => void
  /** Hora (epoch ms) em que o temporizador de sono para o áudio; null = desligado. */
  sleepEndsAt: number | null
  startSleepTimer: (minutes: number) => void
  cancelSleepTimer: () => void
}

/** Estado que muda a cada tique do player: só quem mostra o tempo assina este contexto. */
type PlayerTimeValue = {
  currentTime: number
  duration: number
  seek: (seconds: number) => void
}

const PlayerContext = createContext<PlayerValue | null>(null)
const PlayerTimeContext = createContext<PlayerTimeValue | null>(null)

const KEYS = {
  liked: 'sonora:liked',
  volume: 'sonora:volume',
  recent: 'sonora:recent',
  tracks: 'sonora:tracks',
  player: 'sonora:player',
  durations: 'sonora:durations',
}

/** Última fila/faixa mostrada, para voltar a aparecer ao reabrir a app. */
const readPlayerState = (): {
  order: string[]
  pos: number
  playing: boolean
  /** Player nativo que estava carregado (para o reencontrar ao reabrir a app). */
  assetId: string | null
} => {
  const saved = readStored<{
    order?: unknown
    pos?: unknown
    playing?: unknown
    assetId?: unknown
  }>(KEYS.player, {})
  const raw = Array.isArray(saved.order) ? saved.order : []
  const ids = raw.filter(
    (id): id is string => typeof id === 'string' && Boolean(getTrack(id)),
  )
  const index = typeof saved.pos === 'number' ? Math.floor(saved.pos) : -1
  return {
    order: ids,
    pos: index >= 0 && index < ids.length ? index : -1,
    playing: saved.playing === true,
    assetId:
      typeof saved.assetId === 'string' && getTrack(saved.assetId) ? saved.assetId : null,
  }
}

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const store = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — play without persistence */
  }
}

/** Lê uma lista do storage sem quebrar se o valor salvo tiver outro formato. */
const readArray = <T,>(key: string): T[] => {
  const value = readStored<unknown>(key, [])
  return Array.isArray(value) ? (value as T[]) : []
}

// Faixas externas já vistas: restauram curtidas e "tocadas recentemente" após recarregar.
registerTracks(readArray<Track>(KEYS.tracks))

/** Item de fila do motor nativo, com os dados que aparecem no aviso do sistema. */
const nativeItem = (track: Track, assetPath: string) => ({
  assetId: track.id,
  assetPath,
  isUrl: true,
  notificationMetadata: {
    title: track.title,
    artist: track.artist,
    album: track.albumTitle,
    artworkUrl: new URL(track.cover, window.location.origin).href,
  },
})

const shuffledFrom = (ids: string[], first: string | undefined): string[] => {
  const rest = ids.filter((id) => id !== first)
  return first ? [first, ...shuffleArray(rest)] : shuffleArray(rest)
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadedIdRef = useRef<string | null>(null)
  const ytPlayerRef = useRef<YTPlayer | null>(null)
  const ytVideoRef = useRef<string | null>(null)
  const ytTimerRef = useRef<number | null>(null)
  /** No telemóvel o áudio toca no motor nativo (ExoPlayer), que sobrevive ao ecrã bloqueado. */
  const nativePlatform = Capacitor.isNativePlatform()
  /**
   * O único player do motor nativo: o `assetId` que está carregado agora. Toda a
   * reprodução passa por aqui e a anterior é calada e libertada antes de a nova
   * carregar, por isso nunca existe mais de um ExoPlayer vivo. Sem fila do plugin:
   * quem decide a próxima faixa é o JavaScript, no evento de fim.
   */
  const nativeLoadedRef = useRef<string | null>(null)
  /** Fila de operações do motor: impede dois arranques ao mesmo tempo. */
  const nativeQueueRef = useRef<Promise<void>>(Promise.resolve())
  /** Duração que o motor nativo reporta para a faixa atual (para limitar o arrasto). */
  const nativeDurationRef = useRef(0)
  /** Quando o utilizador arrastou a barra pela última vez. */
  const seekedAtRef = useRef(0)
  /** Faixa adotada do motor ao reabrir a app: já toca, não pode ser mandada arrancar outra vez. */
  const adoptedRef = useRef<string | null>(null)
  /** Último "complete" tratado: o plugin emite-o duas vezes para a mesma faixa. */
  const completedRef = useRef<{ assetId: string | null; at: number }>({ assetId: null, at: 0 })
  /**
   * Falso até a fila do motor nativo ser adotada ao abrir a app. Enquanto for falso,
   * nenhum efeito pode mandar no motor — era isso que apagava a música que já tocava.
   */
  const [nativeReady, setNativeReady] = useState(!nativePlatform)
  const addRecentRef = useRef<(id: string) => void>(() => {})

  const [stageEl, setStageEl] = useState<HTMLElement | null>(null)
  const [playerNotice, setPlayerNotice] = useState<PlayerNotice | null>(null)
  /** Temporizador de sono: quando chega à hora, o áudio pára. */
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null)
  const [order, setOrder] = useState<string[]>(() => readPlayerState().order)
  const [contextQueue, setContextQueue] = useState<string[]>([])
  const [pos, setPos] = useState(() => readPlayerState().pos)
  /** Faixas cujo áudio não se conseguiu obter nesta sessão (para não voltar a travar a fila). */
  const failedTracksRef = useRef<Set<string>>(new Set())
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [durations, setDurations] = useState<Record<string, number>>(() => {
    const saved = readStored<Record<string, unknown>>(KEYS.durations, {})
    const clean: Record<string, number> = {}
    Object.entries(saved).forEach(([id, value]) => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) clean[id] = value
    })
    return clean
  })
  const [volume, setVolume] = useState(() => {
    const stored = readStored<number>(KEYS.volume, 0.8)
    return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.8
  })
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [liked, setLiked] = useState<string[]>(() => readArray<string>(KEYS.liked))
  const [recent, setRecent] = useState<string[]>(() => readArray<string>(KEYS.recent))
  // Faixas do YouTube com áudio direto: tocam no elemento de áudio e sobrevivem ao
  // ecrã bloqueado. Sem URL, cai para o iframe (que pausa fora de primeiro plano).
  const [ytAudio, setYtAudio] = useState<Record<string, string>>({})
  const [ytAudioFailed, setYtAudioFailed] = useState<Record<string, boolean>>({})
  /** Muda para obrigar a reconstruir a fila nativa (ex.: escolher outra faixa). */
  const [queueNonce, setQueueNonce] = useState(0)
  const ytAudioRef = useRef(ytAudio)
  ytAudioRef.current = ytAudio

  const currentId = pos >= 0 ? order[pos] : undefined
  const current = useMemo(() => getTrack(currentId) ?? null, [currentId])
  const isYouTube = current?.provider === 'youtube'
  const ytAudioSrc = isYouTube && current ? ytAudio[current.id] : undefined
  /** Faixa do YouTube cujo áudio ainda está a ser resolvido: nenhum motor deve tocar já. */
  const ytAudioPending = Boolean(
    isYouTube && current && !ytAudioSrc && !ytAudioFailed[current.id],
  )
  // Fora do nativo o som sai do elemento de áudio ou, em último caso, do iframe. No
  // telemóvel manda o ExoPlayer: o iframe do YouTube não toca dentro da app (ficava
  // mudo a 0:00 e a música nunca passava à seguinte), por isso nunca é usado lá.
  const usesIframe = Boolean(isYouTube && !ytAudioSrc && !ytAudioPending && !nativePlatform)

  const stateRef = useRef({ order, pos, repeat })
  stateRef.current = { order, pos, repeat }
  const currentRef = useRef<Track | null>(current)
  currentRef.current = current
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime
  const usesIframeRef = useRef(usesIframe)
  usesIframeRef.current = usesIframe
  const endedRef = useRef<() => void>(() => {})
  /** O que o utilizador pediu (tocar/parar). Os eventos do motor não contrariam isto. */
  const intentRef = useRef({ play: false, at: 0 })
  /**
   * Pausa que a própria app pediu (trocar de faixa, "tocar" desligado). As
   * pausas que não vêm daqui são do sistema/notificação e contam como pedido do
   * utilizador — antes eram ignoradas e a música voltava sozinha.
   */
  const selfPauseRef = useRef(false)
  /** Última prova de vida do player nativo (posição a avançar). */
  const lastTickRef = useRef(0)
  /** Último instante em que a barra de progresso foi atualizada. */
  const lastTimeUiRef = useRef(0)

  const setIntent = useCallback((play: boolean) => {
    intentRef.current = { play, at: Date.now() }
    setIsPlaying(play)
  }, [])

  /**
   * Cala e liberta (unload) um player do motor nativo. É isto que garante um só
   * ExoPlayer: a faixa anterior deixa de existir antes de a próxima carregar.
   */
  const dropNativeAsset = useCallback(
    async (assetId: string | null) => {
      if (!nativePlatform || !assetId) return
      logNative('info', `parar e libertar ${assetId}`)
      await logNativeCall('pause', NativeAudio.pause({ assetId })).catch(() => {})
      await logNativeCall('unload', NativeAudio.unload({ assetId })).catch(() => {})
      if (nativeLoadedRef.current === assetId) nativeLoadedRef.current = null
      // Já não existe: voltar a esta faixa tem de carregar um player novo.
      if (adoptedRef.current === assetId) adoptedRef.current = null
    },
    [nativePlatform],
  )

  /**
   * Marca que a pausa seguinte é pedida pela app (o evento não pode anular a
   * intenção do utilizador). Não pode ficar presa: se o evento não vier, cai.
   */
  const ignorarPausaPropria = useCallback(() => {
    selfPauseRef.current = true
    window.setTimeout(() => {
      selfPauseRef.current = false
    }, 600)
  }, [])

  /**
   * Pausa pedida pela app. No APK o script nativo engole o `pause()` do `<audio>`
   * enquanto segura a música em segundo plano, por isso abre-se a janela.
   */
  const pausarAudio = useCallback(
    (el: HTMLAudioElement) => {
      if (el.paused) return
      ignorarPausaPropria()
      permitirPausa()
      el.pause()
    },
    [ignorarPausaPropria],
  )

  /** Manda o motor ativo calar/tocar já, sem esperar por efeitos nem pela fila. */
  const applyPlaybackNow = useCallback(
    (play: boolean) => {
      if (nativePlatform && !usesIframeRef.current) {
        const assetId = nativeLoadedRef.current
        const { order: list, pos: index } = stateRef.current
        const activeId = index >= 0 ? list[index] : null
        if (play) {
          // Só a faixa que o "agora tocando" mostra pode arrancar.
          if (assetId && assetId === activeId) {
            const total = nativeDurationRef.current
            // Player no fim: `resume` não faz nada. Sempre com tempo > 0, porque a 0
            // o plugin não reposiciona o player e o pedido é ignorado.
            if (total > 0 && currentTimeRef.current >= total - 1) {
              setCurrentTime(0)
              void logNativeCall('play (no fim)', NativeAudio.play({ assetId, time: 0.2 })).catch(
                () => {},
              )
            } else {
              void logNativeCall('resume', NativeAudio.resume({ assetId })).catch(() =>
                logNativeCall('play (resume falhou)', NativeAudio.play({ assetId, time: 0.2 })).catch(
                  () => {},
                ),
              )
            }
            return
          }
          // Não há player desta faixa (foi libertado): o efeito de carga arranca-o.
          setQueueNonce((value) => value + 1)
          return
        }
        if (assetId) void logNativeCall('pause', NativeAudio.pause({ assetId })).catch(() => {})
        return
      }

      const audio = audioRef.current
      if (audio) {
        if (play) void audio.play().catch(() => {})
        else pausarAudio(audio)
      }
      try {
        if (play) ytPlayerRef.current?.playVideo?.()
        else ytPlayerRef.current?.pauseVideo?.()
      } catch {
        /* player ainda não existe */
      }
    },
    [nativePlatform, pausarAudio],
  )

  const startSleepTimer = useCallback((minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return
    setSleepEndsAt(Date.now() + minutes * 60_000)
  }, [])

  const cancelSleepTimer = useCallback(() => setSleepEndsAt(null), [])

  /** Temporizador de sono: quando acaba, o áudio pára e o aviso explica porquê. */
  useEffect(() => {
    if (!sleepEndsAt) return
    const remaining = sleepEndsAt - Date.now()
    if (remaining <= 0) {
      setSleepEndsAt(null)
      return
    }
    const timer = window.setTimeout(() => {
      setSleepEndsAt(null)
      setIntent(false)
      setPlayerNotice({ message: 'Temporizador: a música parou. Bom descanso.' })
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [sleepEndsAt, setIntent])

  const stopYtTimer = useCallback(() => {
    if (ytTimerRef.current !== null) {
      window.clearInterval(ytTimerRef.current)
      ytTimerRef.current = null
    }
  }, [])

  const startYtTimer = useCallback(
    (player: YTPlayer) => {
      stopYtTimer()
      let lastSecond = -1
      ytTimerRef.current = window.setInterval(() => {
        try {
          const time = player.getCurrentTime?.() ?? 0
          const total = player.getDuration?.() ?? 0
          // No WebView o iframe partilha a thread com a página: só re-renderiza
          // quando muda o segundo que a barra mostra.
          const second = Math.floor(time)
          if (!isWebView || second !== lastSecond) {
            lastSecond = second
            setCurrentTime(time)
          }
          if (total > 0) setDuration(total)
        } catch {
          /* player destruído */
        }
      }, 500)
    },
    [stopYtTimer],
  )

  const attachStage = useCallback((element: HTMLElement | null) => setStageEl(element), [])

  // ---------- motor 1: elemento de áudio (Audius, Apple, catálogo local) ----------
  useEffect(() => {
    // No telemóvel o som sai do motor nativo: um <audio> aqui tocava em duplicado.
    if (nativePlatform) return
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    // No telemóvel só re-renderiza quando muda o segundo: a barra mostra segundos
    // e cada render a mais rouba tempo ao WebView enquanto o áudio toca.
    let lastSecond = -1
    const onTime = () => {
      const time = audio.currentTime
      if (isWebView) {
        const second = Math.floor(time)
        if (second === lastSecond) return
        lastSecond = second
      }
      setCurrentTime(time)
    }
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const total = audio.duration
        setDuration(total)
        // Guarda o comprimento real da faixa que está a tocar: a lista passa a
        // mostrar o tempo sem ter de a carregar outra vez.
        const id = loadedIdRef.current
        if (id) {
          setDurations((prev) =>
            Math.abs((prev[id] ?? 0) - total) < 1 ? prev : { ...prev, [id]: total },
          )
        }
      }
      setPlayerNotice(null)
    }
    const onEnded = () => endedRef.current()
    // Quando a faixa atual é do YouTube, o áudio é pausado de propósito: esses eventos
    // não podem mexer no isPlaying, que agora pertence ao outro motor.
    const onPlay = () => {
      if (!usesIframeRef.current) setIsPlaying(true)
    }
    const onPause = () => {
      if (usesIframeRef.current) return
      // A pausa que a própria app pede (trocar de faixa, desligar o som) não pode
      // anular a intenção do utilizador.
      if (selfPauseRef.current) {
        selfPauseRef.current = false
        return
      }
      // Pausa de fora: barra de notificação, auscultadores, outra app. É o
      // utilizador que a pediu, por isso o estado tem de a seguir — antes ficava
      // a "tocar" e o efeito seguinte voltava a dar play uns segundos depois.
      if (intentRef.current.play) setIntent(false)
      setIsPlaying(false)
    }
    const onVolume = () => setMuted(audio.muted)
    const onError = () => {
      if (currentRef.current?.provider === 'youtube') return
      if (!audio.getAttribute('src')) return
      setIsPlaying(false)
      setPlayerNotice({ message: 'Não foi possível tocar esta faixa. Tente outra.' })
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('volumechange', onVolume)
    audio.addEventListener('error', onError)

    return () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('volumechange', onVolume)
      audio.removeEventListener('error', onError)
      audioRef.current = null
      loadedIdRef.current = null
    }
  }, [])

  // ---------- motor nativo (Android): continua com a app em segundo plano ----------
  useEffect(() => {
    if (!nativePlatform) return
    let disposed = false
    const cleanups: Array<() => void> = []

    void NativeAudio.configure({
      background: true,
      backgroundPlayback: true,
      // Com a notificação ligada o plugin arranca o serviço em primeiro plano,
      // que é a peça que impede o Android de matar a música fora da app.
      showNotification: true,
      focus: true,
    })
      .then(() => logNative('info', 'motor configurado'))
      .catch((error: unknown) => {
        logNative(
          'error',
          `configure → ${error instanceof Error ? error.message : String(error)}`,
        )
      })

    void (async () => {
      const timeListener = await NativeAudio.addListener('currentTime', (event) => {
        if (disposed) return
        // Prova de vida: a posição avançou, o player está mesmo a tocar.
        if (typeof event.currentTime === 'number' && event.currentTime > 0.5) {
          lastTickRef.current = Date.now()
        }
        // O plugin emite de 100 em 100 ms e cada emissão re-renderiza a app toda,
        // o que engasga o WebView. A 4 Hz a barra anda igual e a interface respira.
        const now = Date.now()
        if (now - lastTimeUiRef.current < 250) return
        lastTimeUiRef.current = now
        setCurrentTime(event.currentTime)
      })
      const completeListener = await NativeAudio.addListener('complete', (event) => {
        if (disposed) return
        const assetId = event.assetId
        logNative('event', `fim · ${assetId ?? '—'}`)
        // O plugin emite "complete" duas vezes para a mesma faixa: o segundo aviso não
        // pode avançar a fila outra vez (saltava uma música).
        if (
          assetId &&
          completedRef.current.assetId === assetId &&
          Date.now() - completedRef.current.at < 2500
        ) {
          return
        }
        completedRef.current = { assetId: assetId ?? null, at: Date.now() }
        // Aviso de uma faixa que já não é a do ecrã (player antigo, parado ou
        // libertado): não pode mexer na reprodução nem avançar a fila.
        {
          const { order: list, pos: index } = stateRef.current
          const activeId = index >= 0 ? list[index] : null
          if (assetId && activeId && assetId !== activeId) return
        }

        // Repetir a mesma faixa: voltar a tocar do início (o player é o mesmo).
        if (assetId && stateRef.current.repeat === 'one') {
          // Tempo > 0 para o player recomeçar mesmo (a 0 o plugin não reposiciona).
          void logNativeCall('play (repetir)', NativeAudio.play({ assetId, time: 0.2 })).catch(
            () => {},
          )
          setCurrentTime(0)
          return
        }

        // A faixa "acabou" logo a seguir a um arrasto: o arrasto passou do fim.
        // Volta a tocar a mesma em vez de saltar para outra música.
        if (assetId && Date.now() - seekedAtRef.current < 1500) {
          seekedAtRef.current = 0
          void logNativeCall('play (passou do fim)', NativeAudio.play({ assetId, time: 0.2 })).catch(
            () => {},
          )
          setCurrentTime(0)
          return
        }

        // Não há fila do plugin: no fim da faixa é a app que decide a próxima
        // (o efeito de carga cala e liberta este player e arranca o da seguinte).
        endedRef.current()
      })
      const stateListener = await NativeAudio.addListener('playbackState', (event) => {
        if (disposed || usesIframeRef.current) return
        logNative(
          'event',
          `estado ${event.isPlaying ? 'a tocar' : 'parado'} (${event.reason ?? '—'}) · ${
            event.assetId ?? '—'
          } · ${secsText(event.currentTime)}/${secsText(event.duration)}`,
        )
        if (event.isPlaying) lastTickRef.current = Date.now()
        if (typeof event.currentTime === 'number') {
          // O plugin emite estado em cada tique: sem o mesmo travão de 4 Hz da
          // barra, cada emissão re-renderizava a app toda e o WebView engasgava
          // (o player ficava a arrastar). Parado, atualiza logo.
          const now = Date.now()
          if (!event.isPlaying || now - lastTimeUiRef.current >= 250) {
            lastTimeUiRef.current = now
            setCurrentTime(event.currentTime)
          }
        }
        if (typeof event.duration === 'number' && event.duration > 0) {
          nativeDurationRef.current = event.duration
          setDuration(event.duration)
        }
        // Só aceitar o estado do motor quando concorda com o pedido do utilizador ou
        // quando vem do aviso/casaco (remotePlay/remotePause). Isso evita que um
        // "playing" atrasado volte a arrancar a música depois de carregar em pausa.
        const remote = (event.reason ?? '').startsWith('remote')
        if (remote) {
          // Aviso/casaco/auscultadores: o pedido passa a ser este.
          intentRef.current = { play: event.isPlaying, at: Date.now() }
          setIsPlaying(event.isPlaying)
        } else if (event.isPlaying === intentRef.current.play) {
          setIsPlaying(event.isPlaying)
        }
      })
      cleanups.push(
        () => void timeListener.remove(),
        () => void completeListener.remove(),
        () => void stateListener.remove(),
      )
    })()

    return () => {
      disposed = true
      cleanups.forEach((run) => run())
    }
  }, [nativePlatform])

  // Guarda a faixa em curso para o "agora tocando" voltar a aparecer ao reabrir a app.
  useEffect(() => {
    if (!order.length || pos < 0) return
    store(KEYS.player, {
      order,
      pos,
      playing: isPlaying,
      assetId: nativePlatform ? nativeLoadedRef.current : null,
    })
  }, [order, pos, isPlaying, nativePlatform])

  /**
   * Ao reabrir a app o serviço nativo pode continuar a tocar a faixa que estava. Sem
   * fila, a memória do player é o id guardado no telemóvel: perguntamos ao motor pelo
   * estado dele e acertamos o ecrã.
   */
  const syncFromNative = useCallback(
    async (kick = false) => {
      if (!nativePlatform) return
      try {
        // Sem fila: a memória do player que ficou a tocar é o id guardado no telemóvel.
        const assetId = readPlayerState().assetId
        if (!assetId) {
          logNative('info', 'motor: sem player guardado')
          return
        }
        const snapshot = await NativeAudio.getPlaybackState({ assetId }).catch(() => null)
        if (!snapshot) {
          logNative('info', `motor: player ${assetId} já não existe`)
          if (nativeLoadedRef.current === assetId) nativeLoadedRef.current = null
          return
        }
        nativeLoadedRef.current = assetId
        adoptedRef.current = assetId
        const index = stateRef.current.order.indexOf(assetId)
        if (index >= 0) setPos(index)
        const playing = snapshot.isPlaying
        logNative('info', `motor: ${assetId} · ${playing ? 'a tocar' : 'parado'}`)
        // A barra de progresso recupera o tempo real em vez de voltar a 0:00.
        if (typeof snapshot.currentTime === 'number' && snapshot.currentTime > 0) {
          setCurrentTime(snapshot.currentTime)
        }
        if (typeof snapshot.duration === 'number' && snapshot.duration > 0) {
          nativeDurationRef.current = snapshot.duration
          setDuration(snapshot.duration)
        }
        // Ao voltar à app o Android pode ter pausado o player e o plugin não retoma
        // sozinho. Se o utilizador quer música, arranca-se em vez de ficar parado.
        if (kick && intentRef.current.play && !playing) {
          const total = nativeDurationRef.current
          const atEnd = total > 0 && currentTimeRef.current >= total - 1
          if (atEnd) {
            setCurrentTime(0)
            void logNativeCall('play (voltar)', NativeAudio.play({ assetId, time: 0.2 })).catch(
              () => {},
            )
          } else {
            void logNativeCall('resume (voltar)', NativeAudio.resume({ assetId })).catch(() =>
              NativeAudio.play({ assetId, time: 0.2 }).catch(() => {}),
            )
          }
          setIntent(true)
        } else {
          setIntent(playing)
        }
      } catch {
        /* motor indisponível */
      } finally {
        // A partir daqui os efeitos já podem mandar no motor.
        setNativeReady(true)
      }
    },
    [nativePlatform, setIntent],
  )

  useEffect(() => {
    if (!nativePlatform) return
    void syncFromNative()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncFromNative(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [nativePlatform, syncFromNative])

  // Load the selected track and honour the play/pause intent.
  useEffect(() => {
    if (nativePlatform) {
      // Antes de adotar o player guardado, mexer no motor calava a música que já
      // estava a tocar. Esperar pelo syncFromNative.
      if (!nativeReady) return
      const track = current
      let cancelled = false

      const srcFor = async (target: Track): Promise<string | null> => {
        if (target.videoId) {
          const direct = ytAudioRef.current[target.id]
          if (direct) return direct
          return resolveYouTubeAudio(target.videoId)
        }
        return target.src || null
      }

      const run = async () => {
        logNative(
          'info',
          `pedido → ${track ? track.title : 'sem faixa'}${usesIframe ? ' (iframe)' : ''}`,
        )
        if (!track || usesIframe) {
          await dropNativeAsset(nativeLoadedRef.current)
          return
        }

        // Faixa adotada do motor ao reabrir a app: já está a tocar, não se recomeça.
        if (adoptedRef.current === track.id) {
          adoptedRef.current = null
          nativeLoadedRef.current = track.id
          return
        }

        // Pausa: fica o player desta faixa (o play é imediato) e sai o anterior.
        if (!isPlaying) {
          const loaded = nativeLoadedRef.current
          if (loaded && loaded !== track.id) await dropNativeAsset(loaded)
          return
        }
        if (cancelled) return

        // Já é esta a faixa carregada: só falta garantir que anda.
        if (nativeLoadedRef.current === track.id) {
          const total = nativeDurationRef.current
          if (total > 0 && currentTimeRef.current >= total - 1) {
            // Player no fim da faixa: recomeçar do início.
            setCurrentTime(0)
            await logNativeCall(
              'play (recomeçar)',
              NativeAudio.play({ assetId: track.id, time: 0.2 }),
            ).catch(() => {})
          } else {
            await logNativeCall('resume', NativeAudio.resume({ assetId: track.id })).catch(() =>
              NativeAudio.play({ assetId: track.id, time: 0.2 }).catch(() => {}),
            )
          }
          logNative('info', `já carregada · ${track.title}`)
          return
        }

        // Um só player: o anterior é calado e libertado antes de a nova carregar.
        await dropNativeAsset(nativeLoadedRef.current)
        if (cancelled) return

        let src = await srcFor(track)
        // A extração do YouTube pode falhar à primeira (rede fria, resposta instável).
        if (!src && track.provider === 'youtube') {
          await new Promise((resolve) => window.setTimeout(resolve, 900))
          if (cancelled) return
          if (track.videoId) forgetYouTubeAudioFailure(track.videoId)
          src = await srcFor(track)
        }
        if (cancelled) return

        if (!src) {
          failedTracksRef.current.add(track.id)
          const { order: list, pos: index } = stateRef.current
          const remaining = list.slice(index + 1).find((id) => !failedTracksRef.current.has(id))
          if (remaining) {
            setPlayerNotice({
              message: `Não consegui tocar “${track.title}”. A passar à seguinte…`,
            })
            setIntent(true)
            setPos(list.indexOf(remaining))
          } else {
            setPlayerNotice({ message: 'Não consegui tocar estas músicas. Tente outra pesquisa.' })
            setIntent(false)
          }
          return
        }
        failedTracksRef.current.delete(track.id)
        try {
          // Só o servidor, sem query: chega para saber de onde vem o áudio.
          logNative('info', `fonte · ${new URL(src).host}`)
        } catch {
          logNative('info', 'fonte · endereço inválido')
        }

        await logNativeCall('preload', NativeAudio.preload(nativeItem(track, src))).catch(() => {})
        if (cancelled) return
        nativeLoadedRef.current = track.id

        // O `preload` regista o player de forma assíncrona: um `play` imediato ainda
        // não encontra o asset e falha com "Audio Asset is missing" (era isto que
        // deixava faixas do catálogo mudas). Insiste-se até o plugin o aceitar.
        // Tempo > 0: a 0 o plugin não reposiciona o player e, no fim, ignora o play.
        const startVolume = Math.max(0.1, Math.min(1, volumeRef.current))
        let started = false
        for (let attempt = 0; attempt < 8 && !started && !cancelled; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 400))
          started = await logNativeCall(
            attempt === 0 ? 'play' : `play (tentativa ${attempt + 1})`,
            NativeAudio.play({ assetId: track.id, time: 0.2, volume: startVolume }),
          )
            .then(() => true)
            .catch(() => false)
        }
        if (!started) logNative('error', `play desistiu · ${track.title}`)
        // O volume do utilizador não viaja com a faixa: aplica-se ao player novo.
        if (started) {
          void NativeAudio.setVolume({
            assetId: track.id,
            volume: mutedRef.current ? 0.001 : Math.max(0.01, volumeRef.current),
          }).catch(() => {})
        }
        setCurrentTime(0)
        logNative('info', `arranque enviado · ${track.title}`)
        // Guarda o player para o voltar a encontrar ao reabrir a app.
        const { order: currentOrder, pos: currentPos } = stateRef.current
        store(KEYS.player, {
          order: currentOrder,
          pos: currentPos,
          playing: intentRef.current.play,
          assetId: track.id,
        })
      }

      // Se uma chamada nativa ficar pendurada, a troca seguinte não pode ficar presa
      // atrás dela (era isso que deixava a app travada).
      nativeQueueRef.current = Promise.race([
        nativeQueueRef.current.catch(() => {}),
        new Promise<void>((resolve) => window.setTimeout(resolve, 4000)),
      ])
        .then(run)
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }

    const audio = audioRef.current
    if (!audio) return
    const src = current ? ytAudioSrc ?? current.src : ''
    if (!current || usesIframe || !src) {
      pausarAudio(audio)
      audio.removeAttribute('src')
      loadedIdRef.current = null
      return
    }
    if (loadedIdRef.current !== current.id) {
      loadedIdRef.current = current.id
      setPlayerNotice(null)
      // A troca de fonte pode disparar uma pausa que não é do utilizador.
      ignorarPausaPropria()
      permitirPausa()
      audio.src = src
      setCurrentTime(0)
      setDuration(durations[current.id] ?? current.duration ?? 0)
    }
    if (isPlaying) {
      // Só arranca se estiver parado: um simples re-render (as durações a
      // chegarem, por exemplo) não pode dar play a uma música que o utilizador
      // pôs em pausa pela notificação.
      if (audio.paused) void audio.play().catch(() => setIsPlaying(false))
    } else if (!audio.paused) {
      pausarAudio(audio)
    }
  }, [
    current,
    isPlaying,
    durations,
    usesIframe,
    ytAudioSrc,
    nativePlatform,
    nativeReady,
    dropNativeAsset,
    queueNonce,
    pausarAudio,
    ignorarPausaPropria,
  ])


  // Trocar de faixa no nativo: o tempo e a duração da anterior não podem ficar na
  // barra (um arrasto com a duração errada saltava para outra música).
  useEffect(() => {
    nativeDurationRef.current = 0
    if (!nativePlatform || !currentId) return
    setCurrentTime(0)
    setDuration(currentRef.current?.duration ?? 0)
  }, [currentId, nativePlatform])

  // Trocar de faixa: o player anterior sai já (calado e libertado), sem esperar pela
  // resolução do áudio da nova. Um só player, sempre.
  useEffect(() => {
    if (!nativePlatform || !currentId) return
    const loaded = nativeLoadedRef.current
    if (loaded && loaded !== currentId) void dropNativeAsset(loaded)
  }, [currentId, nativePlatform, dropNativeAsset])

  // Enquanto toca: amostra periódica do player único (diagnóstico no telemóvel).
  useEffect(() => {
    if (!nativePlatform || !isPlaying || usesIframe) return
    let ticks = 0
    const timer = window.setInterval(() => {
      ticks += 1
      const assetId = nativeLoadedRef.current
      if (!assetId || ticks % 3 !== 0) return
      void NativeAudio.getPlaybackState({ assetId })
        .then((snapshot) =>
          logNative(
            'info',
            `amostra · ${secsText(snapshot.currentTime)}/${secsText(snapshot.duration)} · ${
              snapshot.isPlaying ? 'a tocar' : 'parado'
            }`,
          ),
        )
        .catch((error: unknown) =>
          logNative('error', `amostra → ${error instanceof Error ? error.message : String(error)}`),
        )
    }, 5000)
    return () => window.clearInterval(timer)
  }, [nativePlatform, isPlaying, usesIframe])

  // Se a faixa deixou de tocar no iframe (áudio resolvido ou outra faixa), o vídeo tem de calar.
  useEffect(() => {
    if (usesIframe) return
    const player = ytPlayerRef.current
    if (!player) return
    try {
      player.stopVideo?.()
    } catch {
      /* player indisponível */
    }
  }, [usesIframe, current])

  useEffect(() => {
    if (nativePlatform) {
      const assetId = nativeLoadedRef.current
      if (assetId) {
        void NativeAudio.setVolume({
          assetId,
          volume: muted ? 0.001 : Math.max(0.01, volume),
        }).catch(() => {})
      }
      return
    }
    const audio = audioRef.current
    if (audio) audio.volume = volume
    try {
      ytPlayerRef.current?.setVolume?.(muted ? 0 : Math.round(volume * 100))
    } catch {
      /* player ainda não existe */
    }
  }, [volume, muted, nativePlatform])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.muted = muted
  }, [muted])

  // ---------- motor 2: player do YouTube (só quando não há áudio direto) ----------
  useEffect(() => {
    if (!stageEl || !usesIframe) return
    let cancelled = false

    const boot = async () => {
      try {
        await loadYouTubeApi()
      } catch {
        if (!cancelled) {
          setPlayerNotice({
            message:
              'Não foi possível carregar o player do YouTube. Verifique bloqueadores de anúncio e tente de novo.',
            retry: true,
          })
        }
        return
      }
      if (cancelled) return
      const YT = getYT()
      if (!YT?.Player) {
        setPlayerNotice({
          message: 'O player do YouTube não está disponível agora. Tente de novo.',
          retry: true,
        })
        return
      }

      const startVideo = currentRef.current?.videoId
      const player = new YT.Player(stageEl, {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          // O player está escondido: sem controlos, anotações nem legendas, o
          // YouTube não fica a redesenhar a sua própria barra dentro do iframe.
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        ...(startVideo ? { videoId: startVideo } : {}),
        events: {
          onReady: (event) => {
            if (cancelled || currentRef.current?.provider !== 'youtube' || !usesIframeRef.current) return
            const instance = event.target
            const track = currentRef.current
            setPlayerNotice(null)
            try {
              // Sem pedir qualidade "tiny": no telemóvel o 144p vem muitas vezes em
              // AV1 (descodificado por software) e era isso que cortava o som.
              instance.setVolume?.(mutedRef.current ? 0 : Math.round(volumeRef.current * 100))
              if (track?.videoId) {
                if (startVideo !== track.videoId) {
                  if (isPlayingRef.current) instance.loadVideoById?.(track.videoId)
                  else instance.cueVideoById?.(track.videoId)
                } else if (isPlayingRef.current) {
                  instance.playVideo?.()
                }
                ytVideoRef.current = track.videoId
                setDuration(track.duration ?? 0)
              }
            } catch {
              /* ignore */
            }
            startYtTimer(instance)
          },
          onStateChange: (event) => {
            if (cancelled || currentRef.current?.provider !== 'youtube' || !usesIframeRef.current) return
            const state = event.data
            if (state === 1) {
              if (intentRef.current.play) setIsPlaying(true)
              startYtTimer(event.target)
            } else if (state === 2) {
              if (!intentRef.current.play) setIsPlaying(false)
              stopYtTimer()
            } else if (state === 3) {
              if (intentRef.current.play) setIsPlaying(true)
            } else if (state === 0) {
              stopYtTimer()
              setCurrentTime(0)
              endedRef.current()
            }
          },
          onError: (event) => {
            if (cancelled || currentRef.current?.provider !== 'youtube') return
            stopYtTimer()
            setIsPlaying(false)
            setPlayerNotice({
              message:
                event.data === 101 || event.data === 150
                  ? 'Esta faixa não abre no player daqui. Escolha outra.'
                  : event.data === 100
                    ? 'Esta música não está mais disponível.'
                    : 'Não foi possível tocar esta música agora.',
            })
          },
        },
      })

      ytPlayerRef.current = player
    }

    void boot()

    return () => {
      cancelled = true
      stopYtTimer()
      const player = ytPlayerRef.current
      ytPlayerRef.current = null
      ytVideoRef.current = null
      try {
        player?.destroy?.()
      } catch {
        /* iframe já removido */
      }
    }
  }, [stageEl, usesIframe, startYtTimer, stopYtTimer])

  // Troca o vídeo quando a faixa atual muda (só no modo iframe).
  useEffect(() => {
    if (!usesIframe || !current?.videoId) return
    setPlayerNotice(null)
    setCurrentTime(0)
    setDuration(current.duration ?? 0)
    const player = ytPlayerRef.current
    if (!player) return
    if (ytVideoRef.current === current.videoId) return
    ytVideoRef.current = current.videoId
    try {
      if (isPlayingRef.current) player.loadVideoById?.(current.videoId)
      else player.cueVideoById?.(current.videoId)
    } catch {
      /* ignore */
    }
  }, [current, usesIframe])

  // Play/pause do YouTube segue o estado compartilhado.
  useEffect(() => {
    if (!usesIframe) return
    const player = ytPlayerRef.current
    if (!player) return
    try {
      if (isPlaying) player.playVideo?.()
      else player.pauseVideo?.()
    } catch {
      /* ignore */
    }
  }, [isPlaying, usesIframe, stageEl])

  // Faixas do YouTube: resolve o áudio direto para continuarem a tocar fora da app.
  useEffect(() => {
    if (current?.provider !== 'youtube' || !current.videoId) return
    const videoId = current.videoId
    const id = current.id
    if (ytAudio[id] || ytAudioFailed[id]) return
    const controller = new AbortController()

    resolveYouTubeAudio(videoId, controller.signal)
      .then((url) => {
        if (controller.signal.aborted) return
        if (url) setYtAudio((prev) => (prev[id] ? prev : { ...prev, [id]: url }))
        else setYtAudioFailed((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setYtAudioFailed((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
        }
      })

    return () => controller.abort()
  }, [current, ytAudio, ytAudioFailed])

  useEffect(() => store(KEYS.liked, liked), [liked])
  useEffect(() => store(KEYS.recent, recent), [recent])
  useEffect(() => store(KEYS.volume, volume), [volume])

  // Guarda as faixas externas referenciadas para que sobrevivam ao recarregar.
  useEffect(() => {
    const ids = Array.from(new Set([...liked, ...recent]))
    const external = ids
      .map((id) => getTrack(id))
      .filter((track): track is Track => Boolean(track?.external))
    store(KEYS.tracks, external)
  }, [liked, recent])

  // Tempos já lidos ficam guardados: na abertura seguinte aparecem logo.
  useEffect(() => {
    store(KEYS.durations, durations)
  }, [durations])

  // Comprimento real das faixas do catálogo, uma de cada vez.
  // Antes abriam-se 19 leitores ao mesmo tempo; no WebView isso competia com o
  // player e a rede, por isso isto estava desligado lá e as durações ficavam
  // sempre em "–:––". Agora é um leitor só, com pausa entre leituras, e o
  // telemóvel também recebe os tempos.
  const durationsRef = useRef(durations)
  durationsRef.current = durations

  useEffect(() => {
    if (nativePlatform) return
    let cancelled = false
    let timer: number | undefined
    const probe = new Audio()
    probe.preload = 'metadata'
    const pending = TRACKS.filter((track) => !((durationsRef.current[track.id] ?? 0) > 0))
    let index = 0

    const step = () => {
      if (cancelled) return
      const track = pending[index]
      index += 1
      if (!track) {
        probe.removeAttribute('src')
        return
      }
      const done = () => {
        probe.removeEventListener('loadedmetadata', onMeta)
        probe.removeEventListener('error', done)
        if (!cancelled) timer = window.setTimeout(step, 800)
      }
      const onMeta = () => {
        const total = probe.duration
        if (!cancelled && Number.isFinite(total) && total > 0) {
          setDurations((prev) =>
            Math.abs((prev[track.id] ?? 0) - total) < 1 ? prev : { ...prev, [track.id]: total },
          )
        }
        done()
      }
      probe.addEventListener('loadedmetadata', onMeta)
      probe.addEventListener('error', done)
      probe.src = track.src
      probe.load()
    }

    // Dá tempo ao primeiro desenho e à música que esteja a tocar.
    timer = window.setTimeout(step, 1500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      probe.removeAttribute('src')
    }
  }, [nativePlatform])

  const addRecent = useCallback((id: string) => {
    setRecent((prev) => [id, ...prev.filter((item) => item !== id)].slice(0, 12))
  }, [])
  addRecentRef.current = addRecent

  const playQueue = useCallback(
    (ids: string[], startId?: string) => {
      if (!ids.length) return
      trackPlaybackRequest()
      const first = startId && ids.includes(startId) ? startId : ids[0]
      const nextOrder = shuffle ? shuffledFrom(ids, first) : [...ids]
      // Uma playlist nova é uma nova oportunidade: deixa tentar de novo as que falharam.
      ids.forEach((id) => failedTracksRef.current.delete(id))
      setContextQueue([...ids])
      setOrder(nextOrder)
      setPos(nextOrder.indexOf(first))
      setIntent(true)
      addRecent(first)
    },
    [shuffle, addRecent, setIntent],
  )

  const playTrack = useCallback(
    (id: string) => {
      const track = getTrack(id)
      if (!track) return
      if (currentId === id) {
        const next = !intentRef.current.play
        setIntent(next)
        applyPlaybackNow(next)
        return
      }
      const album = ALBUMS.find((item) => item.id === track.albumId)
      playQueue(album ? album.trackIds : [id], id)
    },
    [currentId, playQueue, setIntent, applyPlaybackNow],
  )

  const toggle = useCallback(() => {
    if (!current) {
      playQueue(
        TRACKS.map((track) => track.id),
        TRACKS[0].id,
      )
      return
    }
    const next = !intentRef.current.play
    setIntent(next)
    applyPlaybackNow(next)
  }, [current, playQueue, setIntent, applyPlaybackNow])

  const step = useCallback(
    (direction: 1 | -1, auto = false) => {
      const { order: list, pos: index, repeat: mode } = stateRef.current
      if (!list.length) return
      let nextIndex = index + direction
      if (nextIndex >= list.length) {
        if (auto && mode === 'off') {
          setIntent(false)
          return
        }
        nextIndex = 0
      }
      if (nextIndex < 0) nextIndex = list.length - 1
      setPos(nextIndex)
      if (!auto) setIntent(true)
      const nextId = list[nextIndex]
      if (nextId) addRecent(nextId)
    },
    [addRecent, setIntent],
  )

  const next = useCallback(() => step(1), [step])

  /** Salta para uma faixa da fila (tocar já). */
  const jumpTo = useCallback(
    (id: string) => {
      const index = stateRef.current.order.indexOf(id)
      if (index < 0) return
      setPos(index)
      setIntent(true)
      addRecent(id)
    },
    [setIntent, addRecent],
  )

  /** Tira uma faixa da fila, acertando a faixa em curso. */
  const removeFromQueue = useCallback(
    (id: string) => {
      const { order: list, pos: index } = stateRef.current
      const at = list.indexOf(id)
      if (at < 0) return
      const nextOrder = list.filter((item) => item !== id)
      setOrder(nextOrder)
      if (!nextOrder.length) {
        setPos(-1)
        setIntent(false)
        applyPlaybackNow(false)
        return
      }
      if (at < index) setPos(index - 1)
      else if (at === index) setPos(Math.min(index, nextOrder.length - 1))
    },
    [setIntent, applyPlaybackNow],
  )

  const seek = useCallback((seconds: number) => {
    if (!usesIframeRef.current && Capacitor.isNativePlatform()) {
      // Nunca deixar o arrasto chegar ao fim da faixa: era isso que fazia o
      // ExoPlayer concluir e saltar para a seguinte sem o utilizador pedir.
      const limit = nativeDurationRef.current
      const target =
        limit > 1 ? Math.min(Math.max(0, seconds), limit - 0.6) : Math.max(0, seconds)
      seekedAtRef.current = Date.now()
      setCurrentTime(target)
      const assetId = nativeLoadedRef.current
      if (assetId) void NativeAudio.setCurrentTime({ assetId, time: target }).catch(() => {})
      return
    }
    if (usesIframeRef.current) {
      try {
        ytPlayerRef.current?.seekTo?.(seconds, true)
      } catch {
        /* ignore */
      }
      setCurrentTime(seconds)
      return
    }
    const audio = audioRef.current
    if (!audio) return
    const end =
      Number.isFinite(audio.duration) && audio.duration > 1 ? audio.duration - 0.3 : seconds
    const target = Math.min(Math.max(0, seconds), end)
    audio.currentTime = target
    setCurrentTime(target)
  }, [])

  const prev = useCallback(() => {
    if (currentTimeRef.current > 3) {
      seek(0)
      return
    }
    step(-1)
  }, [seek, step])

  const nextRef = useRef<() => void>(() => {})
  const prevRef = useRef<() => void>(() => {})
  const seekRef = useRef<(seconds: number) => void>(() => {})
  nextRef.current = next
  prevRef.current = prev
  seekRef.current = seek

  // ---------- botões da notificação do Android (Media Session) ----------
  // A barra de notificação fala com a Media Session do WebView. Sem handlers, o
  // pause de lá mudava a barra mas não chegava ao JavaScript. Aqui os botões
  // passam a mexer no nosso estado, o mesmo que os botões da app.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const session = navigator.mediaSession as unknown as {
      setActionHandler: (
        action: string,
        handler: ((details: { seekTime?: number | null }) => void) | null,
      ) => void
    }
    const bind = (
      action: string,
      handler: ((details: { seekTime?: number | null }) => void) | null,
    ) => {
      try {
        session.setActionHandler(action, handler)
      } catch {
        /* ação não suportada neste WebView */
      }
    }
    bind('play', () => {
      setIntent(true)
      applyPlaybackNow(true)
    })
    bind('pause', () => {
      setIntent(false)
      applyPlaybackNow(false)
    })
    bind('stop', () => {
      setIntent(false)
      applyPlaybackNow(false)
    })
    bind('nexttrack', () => nextRef.current())
    bind('previoustrack', () => prevRef.current())
    bind('seekto', (details) => {
      if (typeof details.seekTime === 'number') seekRef.current(details.seekTime)
    })
    return () => {
      ;['play', 'pause', 'stop', 'nexttrack', 'previoustrack', 'seekto'].forEach((action) =>
        bind(action, null),
      )
    }
  }, [applyPlaybackNow, setIntent])

  // Os controlos do aviso passam a ser só da app. O script do APK, sem esta
  // marca, além do evento também clicava nos botões do player (o "seguinte"
  // saltava duas faixas e a pausa voltava atrás).
  useEffect(() => {
    assumirControlos()
    // A retoma que o código nativo faz ao voltar à app só acontece se ainda
    // quisermos tocar (uma pausa pedida no aviso não pode ser desfeita).
    controlarRetomaNativa(() => intentRef.current.play)
  }, [])

  // O aviso do telemóvel lê a metadata da Media Session para mostrar o título, o
  // artista e a capa. Sem isto, o aviso saía sem nome de música.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    try {
      if (!current) session.metadata = null
      else if (typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: current.albumTitle,
          artwork: [{ src: new URL(current.cover, window.location.origin).href }],
        })
      }
    } catch {
      /* WebView sem MediaMetadata */
    }
    try {
      session.playbackState = isPlaying ? 'playing' : 'paused'
    } catch {
      /* ação não suportada neste WebView */
    }
  }, [current, isPlaying])

  const changeVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value))
    setVolume(clamped)
    if (clamped > 0) setMuted(false)
  }, [])

  const toggleMute = useCallback(() => setMuted((value) => !value), [])

  const toggleShuffle = useCallback(() => {
    const nextShuffle = !shuffle
    const base = contextQueue.length ? contextQueue : order
    if (nextShuffle) {
      const nextOrder = shuffledFrom(base, currentId)
      setOrder(nextOrder)
      setPos(currentId ? nextOrder.indexOf(currentId) : 0)
    } else {
      const restored = [...base]
      setOrder(restored)
      const index = currentId ? restored.indexOf(currentId) : 0
      setPos(index < 0 ? 0 : index)
    }
    setShuffle(nextShuffle)
  }, [shuffle, contextQueue, order, currentId])

  const cycleRepeat = useCallback(() => {
    setRepeat((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'))
  }, [])

  const toggleLike = useCallback((id: string) => {
    setLiked((list) => (list.includes(id) ? list.filter((item) => item !== id) : [id, ...list]))
  }, [])

  const isLiked = useCallback((id: string) => liked.includes(id), [liked])

  // O motor pode ficar mudo (URL sem som, extração falhada). Antes de mexer, exige-se
  // prova de que está mesmo parado: um arranque lento do YouTube leva segundos a
  // encher o buffer e não pode ser confundido com silêncio (era isso que fazia a
  // música parar sozinha e saltar de faixa).
  useEffect(() => {
    if (!nativePlatform || !nativeReady || usesIframe || !current || !isPlaying) return
    const trackId = current.id
    let cancelled = false
    const timers: number[] = []
    const startedAt = Date.now()

    const stalled = async () => {
      if (cancelled || !intentRef.current.play) return false
      const assetId = nativeLoadedRef.current
      if (!assetId) return false
      // Deu sinal de vida desde que este player arrancou: está a tocar.
      if (lastTickRef.current > startedAt) return false
      const state = await NativeAudio.getPlaybackState({ assetId }).catch(() => null)
      if (cancelled || !state) return false
      if (state.isPlaying || (state.currentTime ?? 0) > 0.5) return false
      return true
    }

    const heal = async () => {
      if (!(await stalled())) return
      const assetId = nativeLoadedRef.current
      if (cancelled || !assetId) return
      logNative('info', `sem sinal de vida · a recomeçar ${assetId}`)
      await logNativeCall('play (recuperar)', NativeAudio.play({ assetId, time: 0.2 })).catch(
        () => {},
      )
      timers.push(
        window.setTimeout(() => {
          void (async () => {
            if (!(await stalled())) return
            failedTracksRef.current.add(trackId)
            setPlayerNotice({
              message: `Não consegui tocar “${current.title}”. A passar à seguinte…`,
            })
            endedRef.current()
          })()
        }, 9000),
      )
    }

    // 8 s é mais do que qualquer buffering normal (o YouTube incluído).
    timers.push(window.setTimeout(() => void heal(), 8000))
    return () => {
      cancelled = true
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [current, isPlaying, nativePlatform, nativeReady, usesIframe])

  const handleEnded = useCallback(() => {
    const { repeat: mode } = stateRef.current
    if (mode === 'one') {
      if (!usesIframeRef.current && Capacitor.isNativePlatform()) {
        const assetId = nativeLoadedRef.current
        if (assetId) {
          setCurrentTime(0)
          // Tempo > 0: a 0 o plugin não reposiciona e o player no fim ignora o play.
          void NativeAudio.play({ assetId, time: 0.2 }).catch(() => {})
        }
        return
      }
      if (usesIframeRef.current) {
        try {
          ytPlayerRef.current?.seekTo?.(0, true)
          ytPlayerRef.current?.playVideo?.()
        } catch {
          /* ignore */
        }
        return
      }
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        void audio.play().catch(() => setIsPlaying(false))
      }
      return
    }
    // Sem fila do plugin: a app escolhe a próxima e o efeito de carga troca o player.
    step(1, true)
  }, [step])

  useEffect(() => {
    endedRef.current = handleEnded
  }, [handleEnded])


  // Estatísticas: soma os segundos realmente a tocar e conta a reprodução
  // depois de 20 s da mesma faixa (saltar de faixa não conta).
  const countedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isPlaying || !currentId) return
    let last = Date.now()
    let played = 0
    const tick = () => {
      const now = Date.now()
      const delta = Math.min((now - last) / 1000, 30)
      last = now
      if (!Number.isFinite(delta) || delta <= 0) return
      played += delta
      addListening(currentId, delta)
      if (played >= 20 && countedRef.current !== currentId) {
        countedRef.current = currentId
        addPlay(currentId)
      }
    }
    const timer = window.setInterval(tick, 5000)
    return () => {
      tick()
      window.clearInterval(timer)
      // Ao pausar ou trocar de faixa, os segundos em memória vão para disco.
      flushStats()
    }
  }, [isPlaying, currentId])

  const effectiveDuration =
    duration ||
    (currentId ? durations[currentId] ?? current?.duration ?? 0 : 0)

  // O tempo muda a cada tique; mantê-lo fora deste contexto evita re-renderizar
  // listas, cards e o resto da página várias vezes por segundo.
  // "Ver vídeo": o vídeo toca no YouTube e o áudio da app fica em pausa para não haver dois sons.
  const [watchVideoId, setWatchVideoId] = useState<string | null>(null)
  const [watchInline, setWatchInline] = useState(false)
  const [watchPlaying, setWatchPlaying] = useState(false)
  const resumeAfterWatch = useRef(false)
  /** Onde o vídeo ia: o áudio continua daí ao voltar. */
  const watchTimeRef = useRef<number | null>(null)

  const reportWatchTime = useCallback((seconds: number, total?: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return
    watchTimeRef.current = seconds
    setCurrentTime(seconds)
    if (total && Number.isFinite(total) && total > 0) setDuration(total)
  }, [])

  const reportWatchPlaying = useCallback((playing: boolean) => setWatchPlaying(playing), [])

  const openWatch = useCallback(
    (videoId: string, options?: { inline?: boolean }) => {
      if (!videoId) return
      // Trocar de vídeo já em modo vídeo (faixa seguinte) não pode esquecer que
      // o áudio estava a tocar antes do primeiro vídeo.
      resumeAfterWatch.current = resumeAfterWatch.current || intentRef.current.play
      setIntent(false)
      applyPlaybackNow(false)
      watchTimeRef.current = null
      setWatchPlaying(false)
      setWatchInline(Boolean(options?.inline))
      setWatchVideoId(videoId)
    },
    [setIntent, applyPlaybackNow],
  )

  const closeWatch = useCallback(
    (options?: { play?: boolean }) => {
      setWatchVideoId(null)
      setWatchInline(false)
      setWatchPlaying(false)
      const resume = resumeAfterWatch.current || Boolean(options?.play)
      resumeAfterWatch.current = false
      if (resume) {
        setIntent(true)
        applyPlaybackNow(true)
      }
      // O áudio continua do ponto onde o vídeo ia, e não de onde tinha parado.
      const watchedTo = watchTimeRef.current
      watchTimeRef.current = null
      if (watchedTo !== null) seek(watchedTo)
    },
    [setIntent, applyPlaybackNow, seek],
  )

  // ---------- app Android (WebView): aviso da música com a faixa e botões ----------
  // A app injeta window.GoldStreamNative. Diz-lhe o que toca (título, artista, capa)
  // para mostrar no aviso e manter a música viva fora da app; os botões do aviso
  // chegam como evento 'goldstream-native-control'.
  useEffect(() => {
    const bridge = (window as unknown as { GoldStreamNative?: { postMessage(data: string): void } })
      .GoldStreamNative
    if (!bridge || nativePlatform) return
    // O script do APK já reporta o estado (com posição e duração); dois relatos
    // diferentes deixavam a barra do aviso a saltar.
    if (scriptInjetado()) return
    try {
      bridge.postMessage(
        JSON.stringify({
          type: 'state',
          playing: Boolean(current) && isPlaying,
          title: current?.title ?? '',
          artist: current?.artist ?? '',
          album: current?.albumTitle ?? '',
          artwork: current ? new URL(current.cover, window.location.origin).href : '',
        }),
      )
    } catch {
      /* app sem ponte */
    }
  }, [current, isPlaying, nativePlatform])

  const nativeControlsRef = useRef({ toggle, next, prev })
  nativeControlsRef.current = { toggle, next, prev }
  useEffect(() => {
    if (nativePlatform) return
    const onControl = (event: Event) => {
      const action = (event as CustomEvent<string>).detail
      const controls = nativeControlsRef.current
      if (action === 'next') controls.next()
      else if (action === 'prev') controls.prev()
      else if (action === 'toggle') controls.toggle()
      else if (action === 'play' && !intentRef.current.play) controls.toggle()
      else if (action === 'pause' && intentRef.current.play) controls.toggle()
    }
    window.addEventListener('goldstream-native-control', onControl)
    return () => window.removeEventListener('goldstream-native-control', onControl)
  }, [nativePlatform])

  const timeValue = useMemo<PlayerTimeValue>(
    () => ({ currentTime, duration: effectiveDuration, seek }),
    [currentTime, effectiveDuration, seek],
  )

  const value = useMemo<PlayerValue>(
    () => ({
      current,
      isPlaying,
      durations,
      volume,
      muted,
      shuffle,
      repeat,
      liked,
      recent,
      queue: order,
      queueIndex: pos,
      jumpTo,
      removeFromQueue,
      sleepEndsAt,
      startSleepTimer,
      cancelSleepTimer,
      playQueue,
      playTrack,
      toggle,
      next,
      prev,
      changeVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      toggleLike,
      isLiked,
      attachStage,
      playerNotice,
      watchVideoId,
      watchInline,
      openWatch,
      closeWatch,
      watchPlaying,
      reportWatchTime,
      reportWatchPlaying,
    }),
    [
      current,
      isPlaying,
      durations,
      volume,
      muted,
      shuffle,
      repeat,
      liked,
      recent,
      order,
      pos,
      jumpTo,
      removeFromQueue,
      sleepEndsAt,
      startSleepTimer,
      cancelSleepTimer,
      playQueue,
      playTrack,
      toggle,
      next,
      prev,
      changeVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      toggleLike,
      isLiked,
      attachStage,
      playerNotice,
      watchVideoId,
      watchInline,
      openWatch,
      closeWatch,
      watchPlaying,
      reportWatchTime,
      reportWatchPlaying,
    ],
  )

  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={timeValue}>{children}</PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  )
}

export const usePlayer = (): PlayerValue => {
  const context = useContext(PlayerContext)
  if (!context) throw new Error('usePlayer precisa estar dentro de <PlayerProvider>')
  return context
}

export const usePlayerTime = (): PlayerTimeValue => {
  const context = useContext(PlayerTimeContext)
  if (!context) throw new Error('usePlayerTime precisa estar dentro de <PlayerProvider>')
  return context
}
