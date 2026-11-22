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
import { getYT, loadYouTubeApi, resolveYouTubeAudio, type YTPlayer } from './youtube'
import { addListening, addPlay } from './stats'

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
  openWatch: (videoId: string) => void
  closeWatch: () => void
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
}

/** Última fila/faixa mostrada, para voltar a aparecer ao reabrir a app. */
const readPlayerState = (): { order: string[]; pos: number; playing: boolean } => {
  const saved = readStored<{ order?: unknown; pos?: unknown; playing?: unknown }>(KEYS.player, {})
  const raw = Array.isArray(saved.order) ? saved.order : []
  const ids = raw.filter(
    (id): id is string => typeof id === 'string' && Boolean(getTrack(id)),
  )
  const index = typeof saved.pos === 'number' ? Math.floor(saved.pos) : -1
  return {
    order: ids,
    pos: index >= 0 && index < ids.length ? index : -1,
    playing: saved.playing === true,
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
  const nativeLoadedRef = useRef<string | null>(null)
  /** Assets do motor nativo que ainda estão carregados (têm de ser calados ao trocar). */
  const nativePlayingRef = useRef<Set<string>>(new Set())
  /** Fila do motor nativo: impede dois preload/play ao mesmo tempo para a mesma faixa. */
  const nativeQueueRef = useRef<Promise<void>>(Promise.resolve())
  /** Fila nativa ativa: o ExoPlayer toca e avança a lista sozinho, mesmo bloqueado. */
  const nativeQueueActiveRef = useRef(false)
  /** Faixas já entregues à fila nativa. */
  const nativeQueuedRef = useRef<Set<string>>(new Set())
  /** Muda sempre que a fila nativa é reconstruída (cancela abastecimentos antigos). */
  const queueGenerationRef = useRef(0)
  /** Duração que o motor nativo reporta para a faixa atual (para limitar o arrasto). */
  const nativeDurationRef = useRef(0)
  /** Quando o utilizador arrastou a barra pela última vez. */
  const seekedAtRef = useRef(0)
  /** Faixa que a própria fila nativa começou (não precisa de ser tocada outra vez). */
  const nativeAdvancedRef = useRef<string | null>(null)
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
  const [durations, setDurations] = useState<Record<string, number>>({})
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
  // telemóvel manda o ExoPlayer; o iframe só entra quando a extração do áudio falhou,
  // para a faixa não ficar muda.
  const usesIframe = Boolean(
    isYouTube &&
      !ytAudioSrc &&
      !ytAudioPending &&
      (!nativePlatform || Boolean(current && ytAudioFailed[current.id])),
  )

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

  const setIntent = useCallback((play: boolean) => {
    intentRef.current = { play, at: Date.now() }
    setIsPlaying(play)
  }, [])

  /** Todos os assets que o motor nativo pode ter carregado (para os calar). */
  const nativeAssetIds = useCallback((): string[] => {
    const ids = new Set(nativePlayingRef.current)
    nativeQueuedRef.current.forEach((id) => ids.add(id))
    if (nativeLoadedRef.current) ids.add(nativeLoadedRef.current)
    return Array.from(ids)
  }, [])

  /**
   * Cala tudo menos a faixa indicada. Cada faixa do plugin nativo tem o seu próprio
   * player: sem isto, a faixa anterior continuava a tocar em cima da nova.
   */
  const silenceNativeOthers = useCallback(
    (keep: string | null) => {
      if (!nativePlatform) return
      nativeAssetIds().forEach((assetId) => {
        if (assetId === keep) return
        nativePlayingRef.current.delete(assetId)
        void NativeAudio.pause({ assetId }).catch(() => {})
      })
    },
    [nativePlatform, nativeAssetIds],
  )

  /** Manda o motor ativo calar/tocar já, sem esperar por efeitos nem pela fila. */
  const applyPlaybackNow = useCallback(
    (play: boolean) => {
      if (nativePlatform && !usesIframeRef.current) {
        if (play) {
          const assetId = nativeLoadedRef.current
          if (assetId) {
            silenceNativeOthers(assetId)
            void NativeAudio.resume({ assetId }).catch(() =>
              NativeAudio.play({ assetId }).catch(() => {}),
            )
          }
          return
        }
        nativeAssetIds().forEach((assetId) => {
          void NativeAudio.pause({ assetId }).catch(() => {})
        })
        return
      }

      const audio = audioRef.current
      if (audio) {
        if (play) void audio.play().catch(() => {})
        else audio.pause()
      }
      try {
        if (play) ytPlayerRef.current?.playVideo?.()
        else ytPlayerRef.current?.pauseVideo?.()
      } catch {
        /* player ainda não existe */
      }
    },
    [nativePlatform, nativeAssetIds, silenceNativeOthers],
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
      ytTimerRef.current = window.setInterval(() => {
        try {
          const time = player.getCurrentTime?.() ?? 0
          const total = player.getDuration?.() ?? 0
          setCurrentTime(time)
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

    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
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
      // A pausa que o próprio elemento dispara ao trocar de src não pode anular a
      // intenção do utilizador (era isto que impedia a música de começar/trocar).
      if (intentRef.current.play) return
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
    }).catch(() => {
      /* configuração indisponível */
    })

    void (async () => {
      const timeListener = await NativeAudio.addListener('currentTime', (event) => {
        if (!disposed) setCurrentTime(event.currentTime)
      })
      const completeListener = await NativeAudio.addListener('complete', (event) => {
        if (disposed) return
        const assetId = event.assetId
        // Aviso de uma faixa que já não é a atual: não mexer na reprodução.
        if (assetId && nativeLoadedRef.current && assetId !== nativeLoadedRef.current) return

        // Repetir a mesma faixa: voltar a tocar do início (sem mais nada a tocar).
        if (assetId && stateRef.current.repeat === 'one') {
          silenceNativeOthers(assetId)
          void NativeAudio.play({ assetId, time: 0 }).catch(() => {})
          setCurrentTime(0)
          return
        }

        // A faixa "acabou" logo a seguir a um arrasto: o arrasto passou do fim.
        // Volta a tocar a mesma em vez de saltar para outra música.
        if (assetId && Date.now() - seekedAtRef.current < 1500) {
          seekedAtRef.current = 0
          silenceNativeOthers(assetId)
          void NativeAudio.play({ assetId, time: 0 }).catch(() => {})
          setCurrentTime(0)
          return
        }

        // O plugin só emite "complete" quando NÃO conseguiu passar à faixa
        // seguinte (fim da fila). Antes ficávamos à espera de um avanço que
        // nunca vinha — a música travava. Agora a app assume a próxima.
        nativeQueueActiveRef.current = false
        nativeQueuedRef.current = new Set()
        queueGenerationRef.current += 1
        endedRef.current()
      })
      const queueListener = await NativeAudio.addListener('queueChange', (event) => {
        if (disposed || usesIframeRef.current) return
        const assetId = event.assetId
        if (!assetId) return
        const { order: list, pos: index } = stateRef.current
        const appTrackId = index >= 0 ? list[index] : undefined
        const advanced = assetId !== appTrackId
        if (!advanced) {
          // Só confirma a faixa que já estava escolhida; não mexe na pausa.
          if (intentRef.current.play) setIsPlaying(true)
          return
        }
        const nextIndex = list.indexOf(assetId)
        if (nextIndex < 0) return
        nativeLoadedRef.current = assetId
        nativeAdvancedRef.current = assetId
        nativePlayingRef.current.add(assetId)
        setPos(nextIndex)
        setCurrentTime(0)
        addRecentRef.current(assetId)
        if (intentRef.current.play || event.reason !== 'setQueue') setIsPlaying(true)
      })
      const stateListener = await NativeAudio.addListener('playbackState', (event) => {
        if (disposed || usesIframeRef.current) return
        if (typeof event.currentTime === 'number') setCurrentTime(event.currentTime)
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
        () => void queueListener.remove(),
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
    store(KEYS.player, { order, pos, playing: isPlaying })
  }, [order, pos, isPlaying])

  /** Valor de reprodução que estava guardado quando a app arrancou. */
  const restoredPlayingRef = useRef(readPlayerState().playing)

  /**
   * Ao reabrir a app o serviço nativo pode continuar a tocar. Adota a faixa que o
   * motor tem (para o botão de pausa funcionar) e acerta o ecrã com ela.
   */
  const syncFromNative = useCallback(async () => {
    if (!nativePlatform) return
    try {
      const state = await NativeAudio.getQueueState()
      const assetId = state?.assetId
      if (!assetId || !getTrack(assetId)) return
      const ids = state.assetIds ?? []
      nativeLoadedRef.current = assetId
      nativePlayingRef.current.add(assetId)
      nativeQueueActiveRef.current = true
      ids.forEach((id) => nativeQueuedRef.current.add(id))
      const base = stateRef.current.order.length ? stateRef.current.order : ids
      const index = base.indexOf(assetId)
      setOrder(index >= 0 ? base : [assetId, ...base])
      setPos(index >= 0 ? index : 0)
      setIntent(restoredPlayingRef.current)
    } catch {
      /* sem fila ativa */
    }
  }, [nativePlatform, setIntent])

  useEffect(() => {
    if (!nativePlatform) return
    void syncFromNative()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncFromNative()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [nativePlatform, syncFromNative])

  // Load the selected track and honour the play/pause intent.
  useEffect(() => {
    if (nativePlatform) {
      const track = current
      let cancelled = false

      const run = async () => {
        if (!track || usesIframe) {
          nativeLoadedRef.current = null
          nativeQueueActiveRef.current = false
          nativeQueuedRef.current = new Set()
          queueGenerationRef.current += 1
          await NativeAudio.clearQueue().catch(() => {})
          silenceNativeOthers(null)
          return
        }

        // A fila nativa arrancou esta faixa sozinha (passou de faixa): só acertar o estado.
        if (nativeAdvancedRef.current === track.id) {
          nativeAdvancedRef.current = null
          nativeLoadedRef.current = track.id
          nativePlayingRef.current.add(track.id)
          silenceNativeOthers(track.id)
          setCurrentTime(0)
          if (isPlaying) return
        }

        // Carregou em pausa: cala tudo o que estiver carregado, mesmo que a fila
        // ainda não tenha chegado a esta faixa.
        if (!isPlaying) {
          silenceNativeOthers(null)
          return
        }

        // Ainda não está na fila: o efeito abaixo manda construi-la a partir daqui.
        if (!nativeQueuedRef.current.has(track.id)) return

        // Uma só música de cada vez: cala o que tiver ficado para trás.
        silenceNativeOthers(track.id)
        nativePlayingRef.current.add(track.id)
        if (cancelled) return

        // É outra faixa da fila: o ExoPlayer tem de mudar para ela (senão ficava a
        // tocar a anterior com a app a mostrar a nova).
        if (nativeLoadedRef.current !== track.id) {
          const selected = await NativeAudio.queueSelect({ assetId: track.id })
            .then(() => true)
            .catch(() => false)
          if (cancelled) return
          if (!selected) {
            // A fila nativa não tem esta faixa: manda reconstruir a partir dela.
            nativeQueuedRef.current = new Set()
            nativeQueueActiveRef.current = false
            queueGenerationRef.current += 1
            setQueueNonce((value) => value + 1)
            return
          }
          nativeLoadedRef.current = track.id
        }

        await NativeAudio.resume({ assetId: track.id }).catch(() =>
          NativeAudio.play({ assetId: track.id }).catch(() => {}),
        )
      }

      nativeQueueRef.current = nativeQueueRef.current.then(run).catch(() => {})
      return () => {
        cancelled = true
      }
    }

    const audio = audioRef.current
    if (!audio) return
    const src = current ? ytAudioSrc ?? current.src : ''
    if (!current || usesIframe || !src) {
      audio.pause()
      audio.removeAttribute('src')
      loadedIdRef.current = null
      return
    }
    if (loadedIdRef.current !== current.id) {
      loadedIdRef.current = current.id
      setPlayerNotice(null)
      audio.src = src
      setCurrentTime(0)
      setDuration(durations[current.id] ?? current.duration ?? 0)
    }
    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.pause()
    }
  }, [current, isPlaying, durations, usesIframe, ytAudioSrc, nativePlatform, silenceNativeOthers])

  /**
   * Entrega a lista ao motor nativo. É isto que faz a música mudar sozinha e voltar a
   * arrancar com o telemóvel bloqueado: a passagem de faixa é feita pelo ExoPlayer, sem
   * depender do JavaScript da app acordado.
   */
  useEffect(() => {
    if (!nativePlatform || usesIframe || !current) return

    const headQueued = nativeQueuedRef.current.has(current.id)
    const ids = order.length ? order : [current.id]
    const startIndex = Math.max(0, ids.indexOf(current.id))
    // Cada passagem por aqui invalida as entregas antigas: sem isto, faixas saltadas
    // em paralelo conseguiam arrancar várias ao mesmo tempo.
    const generation = ++queueGenerationRef.current

    const srcFor = async (track: Track): Promise<string | null> => {
      if (track.videoId) {
        const direct = ytAudioRef.current[track.id]
        if (direct) return direct
        return resolveYouTubeAudio(track.videoId)
      }
      return track.src || null
    }

    void (async () => {
      if (!headQueued) {
        const headSrc = await srcFor(current)
        if (queueGenerationRef.current !== generation) return
        if (!headSrc) {
          failedTracksRef.current.add(current.id)

          // Faixa do YouTube sem áudio extraível: no telemóvel ainda toca no player
          // do YouTube (em primeiro plano), em vez de ficar muda.
          if (current.provider === 'youtube') {
            nativeQueueActiveRef.current = false
            nativeQueuedRef.current = new Set()
            nativeLoadedRef.current = null
            silenceNativeOthers(null)
            setYtAudioFailed((prev) =>
              prev[current.id] ? prev : { ...prev, [current.id]: true },
            )
            return
          }

          // Uma música que não dá áudio não pode parar tudo: passa à seguinte.
          const remaining = ids
            .slice(startIndex + 1)
            .find((id) => !failedTracksRef.current.has(id))

          if (remaining) {
            setPlayerNotice({
              message: `Não consegui tocar “${current.title}”. A passar à seguinte…`,
            })
            // A faixa anterior não pode ficar a tocar por baixo da seguinte.
            silenceNativeOthers(null)
            setIntent(true)
            setPos(ids.indexOf(remaining))
          } else {
            setPlayerNotice({ message: 'Não consegui tocar estas músicas. Tente outra pesquisa.' })
            setIntent(false)
          }
          return
        }

        failedTracksRef.current.delete(current.id)

        await NativeAudio.clearQueue().catch(() => {})

        nativeQueuedRef.current = new Set([current.id])
        nativeQueueActiveRef.current = true
        nativeLoadedRef.current = current.id
        nativePlayingRef.current.add(current.id)

        // Um só som: as faixas que ficaram da lista anterior são caladas agora.
        silenceNativeOthers(current.id)

        const queued = await NativeAudio.setQueue({
          items: [nativeItem(current, headSrc)],
          startIndex: 0,
          autoPlay: isPlayingRef.current,
        })
          .then(() => true)
          .catch(() => false)

        // Motor sem fila (versão antiga do plugin): toca a faixa no modo simples,
        // para a música sair de qualquer maneira.
        if (!queued) {
          nativeQueueActiveRef.current = false
          await NativeAudio.preload(nativeItem(current, headSrc)).catch(() => {})
          if (intentRef.current.play) {
            await NativeAudio.play({ assetId: current.id }).catch(() => {})
          }
        }

        // Se carregou em pausa enquanto a faixa carregava, o setQueue pode já ter
        // arrancado: volta a calar. Sem isto a música "não parava".
        if (!intentRef.current.play) {
          await NativeAudio.pause({ assetId: current.id }).catch(() => {})
        }
      }

      // Abastece as 14 seguintes (repetido a cada troca de faixa para a fila nunca
      // chegar ao fim). Só um abastecimento novo interrompe este.
      for (const id of ids.slice(startIndex + 1, startIndex + 15)) {
        if (queueGenerationRef.current !== generation) return
        const track = getTrack(id)
        if (!track || nativeQueuedRef.current.has(id)) continue
        const src = await srcFor(track)
        if (queueGenerationRef.current !== generation) return
        if (!src) continue
        const added = await NativeAudio.queueAdd({ items: [nativeItem(track, src)] })
          .then(() => true)
          .catch(() => false)
        if (added) nativeQueuedRef.current.add(id)
      }
    })()
  }, [current, order, nativePlatform, usesIframe, queueNonce, silenceNativeOthers])

  // Trocar de faixa no nativo: o tempo e a duração da anterior não podem ficar na
  // barra (um arrasto com a duração errada saltava para outra música).
  useEffect(() => {
    nativeDurationRef.current = 0
    if (!nativePlatform || !currentId) return
    setCurrentTime(0)
    setDuration(currentRef.current?.duration ?? 0)
  }, [currentId, nativePlatform])

  // Uma só música de cada vez: quando a faixa muda, o que ficou para trás é calado já.
  useEffect(() => {
    if (!nativePlatform || !currentId) return
    silenceNativeOthers(currentId)
  }, [currentId, nativePlatform, silenceNativeOthers])

  // Repetir também é do motor nativo (uma faixa, a lista toda, ou nada).
  useEffect(() => {
    if (!nativePlatform) return
    const mode = repeat === 'one' ? 'one' : repeat === 'all' ? 'all' : 'none'
    void NativeAudio.setRepeatMode({ mode }).catch(() => {})
  }, [repeat, nativePlatform])

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

  // Read real track lengths once so the lists show accurate durations.
  useEffect(() => {
    let cancelled = false
    const probes: HTMLAudioElement[] = []
    TRACKS.forEach((track) => {
      const probe = new Audio()
      probe.preload = 'metadata'
      probe.src = track.src
      const onMeta = () => {
        if (cancelled) return
        if (Number.isFinite(probe.duration) && probe.duration > 0) {
          setDurations((prev) => (prev[track.id] ? prev : { ...prev, [track.id]: probe.duration }))
        }
      }
      probe.addEventListener('loadedmetadata', onMeta)
      probe.load()
      probes.push(probe)
    })
    return () => {
      cancelled = true
      probes.forEach((probe) => {
        probe.removeAttribute('src')
      })
    }
  }, [])

  const addRecent = useCallback((id: string) => {
    setRecent((prev) => [id, ...prev.filter((item) => item !== id)].slice(0, 12))
  }, [])
  addRecentRef.current = addRecent

  const playQueue = useCallback(
    (ids: string[], startId?: string) => {
      if (!ids.length) return
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

  const handleEnded = useCallback(() => {
    const { repeat: mode } = stateRef.current
    if (nativeQueueActiveRef.current) return
    if (mode === 'one') {
      if (!usesIframeRef.current && Capacitor.isNativePlatform()) {
        const assetId = nativeLoadedRef.current
        if (assetId) {
          silenceNativeOthers(assetId)
          void NativeAudio.play({ assetId, time: 0 }).catch(() => {})
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
    step(1, true)
  }, [step, silenceNativeOthers])

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
    }
  }, [isPlaying, currentId])

  const effectiveDuration =
    duration ||
    (currentId ? durations[currentId] ?? current?.duration ?? 0 : 0)

  // O tempo muda a cada tique; mantê-lo fora deste contexto evita re-renderizar
  // listas, cards e o resto da página várias vezes por segundo.
  // "Ver vídeo": o vídeo toca no YouTube e o áudio da app fica em pausa para não haver dois sons.
  const [watchVideoId, setWatchVideoId] = useState<string | null>(null)
  const resumeAfterWatch = useRef(false)

  const openWatch = useCallback(
    (videoId: string) => {
      if (!videoId) return
      resumeAfterWatch.current = intentRef.current.play
      setIntent(false)
      applyPlaybackNow(false)
      setWatchVideoId(videoId)
    },
    [setIntent, applyPlaybackNow],
  )

  const closeWatch = useCallback(() => {
    setWatchVideoId(null)
    if (resumeAfterWatch.current) {
      resumeAfterWatch.current = false
      setIntent(true)
      applyPlaybackNow(true)
    }
  }, [setIntent, applyPlaybackNow])

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
      openWatch,
      closeWatch,
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
      openWatch,
      closeWatch,
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
