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

  const [stageEl, setStageEl] = useState<HTMLElement | null>(null)
  const [playerNotice, setPlayerNotice] = useState<PlayerNotice | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [contextQueue, setContextQueue] = useState<string[]>([])
  const [pos, setPos] = useState(-1)
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

  const currentId = pos >= 0 ? order[pos] : undefined
  const current = useMemo(() => getTrack(currentId) ?? null, [currentId])
  const isYouTube = current?.provider === 'youtube'
  const ytAudioSrc = isYouTube && current ? ytAudio[current.id] : undefined
  /** Faixa do YouTube cujo áudio ainda está a ser resolvido: nenhum motor deve tocar já. */
  const ytAudioPending = Boolean(
    isYouTube && current && !ytAudioSrc && !ytAudioFailed[current.id],
  )
  const usesIframe = Boolean(isYouTube && !ytAudioSrc && !ytAudioPending)

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
      if (!usesIframeRef.current) setIsPlaying(false)
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
      const completeListener = await NativeAudio.addListener('complete', () => {
        if (!disposed) endedRef.current()
      })
      const stateListener = await NativeAudio.addListener('playbackState', (event) => {
        if (disposed || usesIframeRef.current) return
        if (typeof event.currentTime === 'number') setCurrentTime(event.currentTime)
        if (typeof event.duration === 'number' && event.duration > 0) setDuration(event.duration)
        setIsPlaying(event.isPlaying)
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

  // Load the selected track and honour the play/pause intent.
  useEffect(() => {
    if (nativePlatform) {
      const track = current
      let cancelled = false

      const stopAsset = async (assetId: string) => {
        nativePlayingRef.current.delete(assetId)
        await NativeAudio.stop({ assetId }).catch(() => {})
        await NativeAudio.unload({ assetId }).catch(() => {})
      }

      // Só um áudio pode tocar: todos os outros assets são parados e libertados.
      const silenceOthers = async (keep: string | null) => {
        for (const assetId of Array.from(nativePlayingRef.current)) {
          if (assetId !== keep) await stopAsset(assetId)
        }
      }

      const run = async () => {
        if (!track || usesIframe) {
          nativeLoadedRef.current = null
          await silenceOthers(null)
          return
        }
        const src = ytAudioSrc ?? track.src
        if (!src) return

        await silenceOthers(track.id)

        if (nativeLoadedRef.current !== track.id) {
          await NativeAudio.preload({
            assetId: track.id,
            assetPath: src,
            isUrl: true,
            notificationMetadata: {
              title: track.title,
              artist: track.artist,
              album: track.albumTitle,
              artworkUrl: new URL(track.cover, window.location.origin).href,
            },
          }).catch(() => {})
          if (cancelled) return
          nativeLoadedRef.current = track.id
          loadedIdRef.current = track.id
          setCurrentTime(0)
        }
        nativePlayingRef.current.add(track.id)
        if (cancelled) return
        if (isPlaying) {
          await NativeAudio.play({ assetId: track.id }).catch(() => setIsPlaying(false))
        } else {
          await NativeAudio.pause({ assetId: track.id }).catch(() => {})
        }
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
  }, [current, isPlaying, durations, usesIframe, ytAudioSrc, nativePlatform])

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
              setIsPlaying(true)
              startYtTimer(event.target)
            } else if (state === 2) {
              setIsPlaying(false)
              stopYtTimer()
            } else if (state === 3) {
              setIsPlaying(true)
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

  const playQueue = useCallback(
    (ids: string[], startId?: string) => {
      if (!ids.length) return
      const first = startId && ids.includes(startId) ? startId : ids[0]
      const nextOrder = shuffle ? shuffledFrom(ids, first) : [...ids]
      setContextQueue([...ids])
      setOrder(nextOrder)
      setPos(nextOrder.indexOf(first))
      setIsPlaying(true)
      addRecent(first)
    },
    [shuffle, addRecent],
  )

  const playTrack = useCallback(
    (id: string) => {
      const track = getTrack(id)
      if (!track) return
      if (currentId === id) {
        setIsPlaying((playing) => !playing)
        return
      }
      const album = ALBUMS.find((item) => item.id === track.albumId)
      playQueue(album ? album.trackIds : [id], id)
    },
    [currentId, playQueue],
  )

  const toggle = useCallback(() => {
    if (!current) {
      playQueue(
        TRACKS.map((track) => track.id),
        TRACKS[0].id,
      )
      return
    }
    setIsPlaying((playing) => !playing)
  }, [current, playQueue])

  const step = useCallback(
    (direction: 1 | -1, auto = false) => {
      const { order: list, pos: index, repeat: mode } = stateRef.current
      if (!list.length) return
      let nextIndex = index + direction
      if (nextIndex >= list.length) {
        if (auto && mode === 'off') {
          setIsPlaying(false)
          return
        }
        nextIndex = 0
      }
      if (nextIndex < 0) nextIndex = list.length - 1
      setPos(nextIndex)
      if (!auto) setIsPlaying(true)
      const nextId = list[nextIndex]
      if (nextId) addRecent(nextId)
    },
    [addRecent],
  )

  const next = useCallback(() => step(1), [step])

  const seek = useCallback((seconds: number) => {
    if (!usesIframeRef.current && Capacitor.isNativePlatform()) {
      setCurrentTime(seconds)
      const assetId = nativeLoadedRef.current
      if (assetId) void NativeAudio.setCurrentTime({ assetId, time: seconds }).catch(() => {})
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
    const target = Math.min(Math.max(0, seconds), audio.duration || seconds)
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
    if (mode === 'one') {
      if (!usesIframeRef.current && Capacitor.isNativePlatform()) {
        const assetId = nativeLoadedRef.current
        if (assetId) void NativeAudio.play({ assetId, time: 0 }).catch(() => {})
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
  }, [step])

  useEffect(() => {
    endedRef.current = handleEnded
  }, [handleEnded])


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
      resumeAfterWatch.current = isPlaying
      setIsPlaying(false)
      setWatchVideoId(videoId)
    },
    [isPlaying],
  )

  const closeWatch = useCallback(() => {
    setWatchVideoId(null)
    if (resumeAfterWatch.current) {
      resumeAfterWatch.current = false
      setIsPlaying(true)
    }
  }, [])

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
