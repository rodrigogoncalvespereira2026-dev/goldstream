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
import { addListening, addPlay } from './stats'
import { trackPlaybackRequest } from './analytics'
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
  /**
   * Todos os assets que o motor nativo já teve. Serve para calar o que ficou a tocar
   * noutro player depois de a app reabrir: sem isto, a faixa antiga continuava e a nova
   * arrancava por cima (duas músicas ao mesmo tempo).
   */
  const nativeKnownRef = useRef<Set<string>>(new Set())
  /** Faixa adotada do motor ao reabrir a app: já toca, não pode ser mandada arrancar outra vez. */
  const adoptedRef = useRef<string | null>(null)
  /** Faixas que foram caladas e cujo player ainda tem de ser libertado (unload). */
  const nativeStaleRef = useRef<Set<string>>(new Set())
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

  const setIntent = useCallback((play: boolean) => {
    intentRef.current = { play, at: Date.now() }
    setIsPlaying(play)
  }, [])

  /**
   * Players que o motor nativo tem mesmo carregados. Os ids que só estão na fila nunca
   * tocaram: pedir `pause`/`unload` a esses é uma chamada a falhar por cada um (chegavam
   * a ser 11 por troca) e atrasava a troca de faixa.
   */
  const loadedNativeIds = useCallback((): string[] => {
    const ids = new Set(nativePlayingRef.current)
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
      loadedNativeIds().forEach((assetId) => {
        if (assetId === keep) return
        nativePlayingRef.current.delete(assetId)
        nativeStaleRef.current.add(assetId)
        void NativeAudio.pause({ assetId }).catch(() => {})
      })
    },
    [nativePlatform, loadedNativeIds],
  )

  /**
   * Liberta (unload) os players das faixas que já não são a atual. Duas razões:
   * o plugin, ao parar a faixa anterior, volta a preparar o player dela com o mesmo
   * URL e ele arranca outra vez sozinho (era isto que punha duas músicas a tocar ao
   * mesmo tempo ao trocar de faixa); e os players nunca eram libertados, por isso a
   * app ia acumulando ExoPlayers até ficar travada.
   *
   * Só pode ser chamado depois de a faixa nova já estar a tocar: o plugin precisa da
   * anterior ainda carregada na lista para a poder parar.
   */
  const releaseNativeOthers = useCallback(
    (keep: string | null, confirmedCurrent?: string) => {
      if (!nativePlatform) return
      const ids = new Set(nativePlayingRef.current)
      nativeStaleRef.current.forEach((id) => ids.add(id))
      if (nativeLoadedRef.current) ids.add(nativeLoadedRef.current)
      ids.delete(keep ?? '')
      // A faixa atual nunca pode ser calada nem libertada por aqui.
      nativeStaleRef.current.delete(keep ?? '')
      if (!ids.size) return

      logNative('info', `calar ${ids.size} player(s)`)

      // Calar é imediato e não depende de nada: é isto que acaba com as duas
      // músicas a tocar ao mesmo tempo.
      ids.forEach((assetId) => {
        nativePlayingRef.current.delete(assetId)
        if (nativeLoadedRef.current === assetId) nativeLoadedRef.current = keep
        void NativeAudio.pause({ assetId }).catch(() => {})
      })

      // Só se liberta (unload) o que o motor confirma que já não é a faixa atual: um
      // player libertado que o plugin continue a considerar `currentlyPlayingAssetId`
      // faz todas as trocas seguintes falharem e a música deixa de tocar. Sem
      // confirmação fica só a pausa — silêncio garantido, player libertado na
      // próxima troca em que for seguro.
      void (async () => {
        // A resposta do setQueue/queueSelect já diz qual é a faixa atual: usá-la evita
        // esperar por mais uma chamada (eram ~3 s com o player antigo a soar).
        const current =
          confirmedCurrent ??
          (await NativeAudio.getQueueState().catch(() => null))?.assetId ??
          null
        // Sem faixa atual confirmada (fila vazia) não se liberta nada.
        if (!current) return
        ids.forEach((assetId) => {
          if (assetId === current) return
          nativeStaleRef.current.delete(assetId)
          nativeKnownRef.current.delete(assetId)
          logNative('info', `libertar ${assetId}`)
          void logNativeCall('unload', NativeAudio.unload({ assetId })).catch(() => {})
        })
      })()
    },
    [nativePlatform],
  )

  /**
   * Cala tudo o que não seja a faixa indicada, incluindo o que o motor tem na fila.
   * O plugin só pára o `currentlyPlayingAssetId` ao arrancar outra faixa: um player
   * que tenha ficado por trás (entrega atrasada, fila antiga, app reaberta) continua
   * a tocar. Esta é a barreira que garante uma só música de cada vez.
   */
  const stopNativeOthers = useCallback(
    async (keep: string | null) => {
      if (!nativePlatform) return
      const ids = new Set(loadedNativeIds())
      const state = await NativeAudio.getQueueState().catch(() => null)
      state?.assetIds?.forEach((id) => ids.add(id))
      if (state?.assetId) ids.add(state.assetId)
      if (keep) ids.delete(keep)
      ids.forEach((assetId) => {
        nativePlayingRef.current.delete(assetId)
        void NativeAudio.pause({ assetId }).catch(() => {})
      })
    },
    [nativePlatform, loadedNativeIds],
  )

  /** Manda o motor ativo calar/tocar já, sem esperar por efeitos nem pela fila. */
  const applyPlaybackNow = useCallback(
    (play: boolean) => {
      if (nativePlatform && !usesIframeRef.current) {
        if (play) {
          const assetId = nativeLoadedRef.current
          // Só a faixa que o "agora tocando" mostra pode arrancar: se o motor aponta
          // para uma faixa antiga, o efeito de carga trata da certa.
          const { order: list, pos: index } = stateRef.current
          const activeId = index >= 0 ? list[index] : null
          if (assetId && assetId === activeId) {
            silenceNativeOthers(assetId)
            const total = nativeDurationRef.current
            // Player já no fim: `resume` não faz nada. Recomeçar do zero é o que o
            // utilizador espera ao carregar em play depois de a faixa acabar.
            // Sempre com um tempo > 0: a 0 o plugin não reposiciona o player e, se
            // ele estiver no fim, o `play` é ignorado (a música ficava parada).
            if (total > 0 && currentTimeRef.current >= total - 1) {
              setCurrentTime(0)
              void logNativeCall('play (no fim)', NativeAudio.play({ assetId, time: 0.2 })).catch(() => {})
            } else {
              void logNativeCall('resume', NativeAudio.resume({ assetId })).catch(() =>
                void logNativeCall('play (resume falhou)', NativeAudio.play({ assetId, time: 0.2 })).catch(
                  () => {},
                ),
              )
            }
          }
          return
        }
        silenceNativeOthers(null)
        // A fila do motor pode ter uma faixa que a app já não conhece: cala-a também.
        void stopNativeOthers(null)
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
    [nativePlatform, silenceNativeOthers, stopNativeOthers],
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
        if (!disposed) setCurrentTime(event.currentTime)
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

        // Repetir a mesma faixa: voltar a tocar do início (sem mais nada a tocar).
        if (assetId && stateRef.current.repeat === 'one') {
          silenceNativeOthers(assetId)
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
          silenceNativeOthers(assetId)
          void logNativeCall('play (passou do fim)', NativeAudio.play({ assetId, time: 0.2 })).catch(
            () => {},
          )
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
        logNative('event', `fila · ${assetId} (${event.reason ?? '—'})`)
        const { order: list, pos: index } = stateRef.current
        const appTrackId = index >= 0 ? list[index] : undefined
        const advanced = assetId !== appTrackId
        if (!advanced) {
          // Só confirma a faixa que já estava escolhida; não mexe na pausa.
          if (intentRef.current.play) setIsPlaying(true)
          return
        }
        const nextIndex = list.indexOf(assetId)
        if (nextIndex < 0) {
          // Uma fila antiga arrancou uma faixa que a app já não tem (lista mudou):
          // cala-a e reconstrói a fila a partir do que está no ecrã, senão ficava
          // tudo dessincronizado e a música parava sem se perceber porquê.
          void NativeAudio.pause({ assetId }).catch(() => {})
          nativeQueueActiveRef.current = false
          nativeQueuedRef.current = new Set()
          queueGenerationRef.current += 1
          setQueueNonce((value) => value + 1)
          return
        }
        nativeLoadedRef.current = assetId
        nativeAdvancedRef.current = assetId
        nativePlayingRef.current.add(assetId)
        nativeKnownRef.current.add(assetId)
        setPos(nextIndex)
        setCurrentTime(0)
        addRecentRef.current(assetId)
        if (intentRef.current.play || event.reason !== 'setQueue') setIsPlaying(true)
      })
      const stateListener = await NativeAudio.addListener('playbackState', (event) => {
        if (disposed || usesIframeRef.current) return
        logNative(
          'event',
          `estado ${event.isPlaying ? 'a tocar' : 'parado'} (${event.reason ?? '—'}) · ${
            event.assetId ?? '—'
          } · ${secsText(event.currentTime)}/${secsText(event.duration)}`,
        )
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
      const ids = state?.assetIds ?? []
      logNative('info', `motor: ${ids.length} na fila · atual ${state?.assetId ?? '—'}`)
      // A fila do motor é a única fonte de verdade: guardamos tudo o que ele tem para
      // conseguir calar as faixas antigas quando o utilizador escolher outra.
      ids.forEach((id) => {
        nativeQueuedRef.current.add(id)
        nativeKnownRef.current.add(id)
      })
      const assetId = state?.assetId
      if (!assetId || !getTrack(assetId)) return
      nativeLoadedRef.current = assetId
      nativePlayingRef.current.add(assetId)
      nativeKnownRef.current.add(assetId)
      nativeQueueActiveRef.current = true
      adoptedRef.current = assetId
      const stored = stateRef.current.order
      const storedIndex = stored.indexOf(assetId)
      const nativeIndex = ids.indexOf(assetId)
      // Se a faixa em curso não está na ordem guardada, a ordem certa é a do motor —
      // não uma lista nova que escondia o que estava a tocar.
      setOrder(storedIndex >= 0 ? stored : ids.length ? ids : [assetId, ...stored])
      setPos(storedIndex >= 0 ? storedIndex : Math.max(0, nativeIndex))
      // O estado real do motor é que decide o botão tocar/pausa. O valor guardado no
      // telefone podia estar desatualizado (ex.: mudou de faixa com a app fechada).
      const snapshot = await NativeAudio.getPlaybackState({ assetId }).catch(() => null)
      const playing = snapshot
        ? snapshot.isPlaying
        : await NativeAudio.isPlaying({ assetId })
            .then((result) => result.isPlaying)
            .catch(() => restoredPlayingRef.current)
      logNative('info', `adotado: ${playing ? 'a tocar' : 'parado'} · ${assetId}`)
      if (playing) nativePlayingRef.current.add(assetId)
      // A barra de progresso voltava a 0:00 ao reabrir; agora recupera o tempo real.
      if (snapshot) {
        if (typeof snapshot.currentTime === 'number' && snapshot.currentTime > 0) {
          setCurrentTime(snapshot.currentTime)
        }
        if (typeof snapshot.duration === 'number' && snapshot.duration > 0) {
          nativeDurationRef.current = snapshot.duration
          setDuration(snapshot.duration)
        }
      }
      setIntent(playing)
    } catch {
      /* sem fila ativa */
    } finally {
      // A partir daqui os efeitos já podem mandar no motor.
      setNativeReady(true)
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
      // Antes de adotar a fila nativa, mexer no motor calava a música que já estava a
      // tocar (ou deixava a antiga por baixo). Esperar pelo syncFromNative.
      if (!nativeReady) return
      const track = current
      let cancelled = false

      const run = async () => {
        logNative('info', `pedido → ${track ? track.title : 'sem faixa'}${usesIframe ? ' (iframe)' : ''}`)
        if (!track || usesIframe) {
          nativeLoadedRef.current = null
          nativeQueueActiveRef.current = false
          nativeQueuedRef.current = new Set()
          queueGenerationRef.current += 1
          await NativeAudio.clearQueue().catch(() => {})
          void stopNativeOthers(null)
          return
        }

        // A fila nativa arrancou esta faixa sozinha (passou de faixa): só acertar o estado.
        if (nativeAdvancedRef.current === track.id) {
          nativeAdvancedRef.current = null
          nativeLoadedRef.current = track.id
          nativePlayingRef.current.add(track.id)
          silenceNativeOthers(track.id)
          // A faixa anterior já acabou: o player dela é libertado já, senão o
          // ExoPlayer antigo voltava a soar e a app acumulava players.
          releaseNativeOthers(track.id)
          setCurrentTime(0)
          if (isPlaying) return
        }

        // Carregou em pausa: cala tudo o que estiver carregado, mesmo que a fila
        // ainda não tenha chegado a esta faixa.
        if (!isPlaying) {
          silenceNativeOthers(null)
          void stopNativeOthers(null)
          return
        }

        // Faixa adotada do motor ao reabrir a app: já está a tocar. Mandá-la arrancar
        // outra vez recomeçava do início e podia soar em duplicado.
        if (adoptedRef.current === track.id) {
          adoptedRef.current = null
          nativeLoadedRef.current = track.id
          silenceNativeOthers(track.id)
          return
        }

        // Ainda não está na fila: o efeito abaixo manda construi-la a partir daqui.
        if (!nativeQueuedRef.current.has(track.id)) return

        // Uma só música de cada vez: cala já o que ficou para trás. O `pause` também
        // impede que o player antigo arranque outra vez quando o plugin o recarrega
        // para o parar. A varredura do que a fila do motor guarda segue sem prender a
        // troca (era isso que deixava a app travada ao mudar de música).
        silenceNativeOthers(track.id)
        void stopNativeOthers(track.id)
        nativePlayingRef.current.add(track.id)
        if (cancelled) return

        // É outra faixa da fila: o ExoPlayer tem de mudar para ela (senão ficava a
        // tocar a anterior com a app a mostrar a nova).
        const switched = nativeLoadedRef.current !== track.id
        let confirmedCurrent: string | undefined
        if (switched) {
          const selectedState = await logNativeCall(
            'queueSelect',
            NativeAudio.queueSelect({ assetId: track.id }),
          ).catch(() => null)
          const selected = Boolean(selectedState)
          confirmedCurrent = selectedState?.assetId
          logNative(
            'info',
            selected
              ? `fila: selecionada · atual ${selectedState?.assetId ?? '—'}`
              : 'fila: seleção falhou',
          )
          if (cancelled) {
            // Já foi escolhida outra faixa: esta não pode ficar a soar por cima.
            nativeStaleRef.current.add(track.id)
            void NativeAudio.pause({ assetId: track.id }).catch(() => {})
            return
          }
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

        // Numa troca de faixa arranca-se com um tempo > 0: o player desta faixa pode
        // já ter chegado ao fim noutra volta e, a 0, o plugin não o reposiciona — o
        // `resume`/`play` era ignorado e a música ficava parada.
        if (switched) {
          await logNativeCall(
            'play (troca)',
            NativeAudio.play({ assetId: track.id, time: 0.2 }),
          ).catch(() =>
            logNativeCall('resume (troca)', NativeAudio.resume({ assetId: track.id })).catch(() => {}),
          )
        } else {
          await logNativeCall('resume', NativeAudio.resume({ assetId: track.id })).catch(() =>
            logNativeCall('play 0.2', NativeAudio.play({ assetId: track.id, time: 0.2 })).catch(() => {}),
          )
        }
        logNative('info', `arranque enviado · ${track.title}`)
        if (cancelled) {
          // Já foi escolhida outra faixa: esta não pode ficar a soar por cima.
          nativeStaleRef.current.add(track.id)
          void NativeAudio.pause({ assetId: track.id }).catch(() => {})
          return
        }
        // A faixa nova já está a tocar: agora é seguro libertar os players antigos.
        // O plugin parou a anterior, mas voltou a prepará-la pronta a tocar, e ela
        // arrancava por cima da nova (duas músicas ao mesmo tempo).
        releaseNativeOthers(track.id, confirmedCurrent)
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
  }, [
    current,
    isPlaying,
    durations,
    usesIframe,
    ytAudioSrc,
    nativePlatform,
    nativeReady,
    silenceNativeOthers,
    stopNativeOthers,
    releaseNativeOthers,
  ])

  /**
   * Entrega a lista ao motor nativo. É isto que faz a música mudar sozinha e voltar a
   * arrancar com o telemóvel bloqueado: a passagem de faixa é feita pelo ExoPlayer, sem
   * depender do JavaScript da app acordado.
   */
  useEffect(() => {
    if (!nativePlatform || !nativeReady || usesIframe || !current) return

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
        let headSrc = await srcFor(current)
        // A extração do YouTube pode falhar à primeira (rede fria, resposta instável).
        // No telemóvel vale insistir: ali não há iframe de reserva.
        if (!headSrc && nativePlatform && current.provider === 'youtube') {
          await new Promise((resolve) => window.setTimeout(resolve, 900))
          if (queueGenerationRef.current !== generation) return
          if (current.videoId) forgetYouTubeAudioFailure(current.videoId)
          headSrc = await srcFor(current)
        }
        if (queueGenerationRef.current !== generation) return
        if (!headSrc) {
          failedTracksRef.current.add(current.id)

          // Faixa do YouTube sem áudio extraível: no browser ainda toca no player do
          // YouTube. No telemóvel esse player fica mudo dentro da app, por isso a
          // faixa entra no caminho normal de "não deu, passa à seguinte".
          if (current.provider === 'youtube' && !nativePlatform) {
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

        await logNativeCall('clearQueue', NativeAudio.clearQueue()).catch(() => {})
        // Outra troca de faixa já começou: esta entrega é antiga e não pode arrancar
        // som nenhum (duas músicas a tocar ao mesmo tempo).
        if (queueGenerationRef.current !== generation) return

        // A fila antiga foi limpa: nada do que estava carregado interessa daqui para a frente.
        nativeKnownRef.current = new Set()
        nativeQueuedRef.current = new Set([current.id])
        nativeQueueActiveRef.current = true
        nativeLoadedRef.current = current.id
        nativePlayingRef.current.add(current.id)
        nativeKnownRef.current.add(current.id)

        // Um só som: as faixas que ficaram da lista anterior são caladas agora.
        silenceNativeOthers(current.id)

        const queuedState = await logNativeCall(
          'setQueue',
          NativeAudio.setQueue({
            items: [nativeItem(current, headSrc)],
            startIndex: 0,
            autoPlay: isPlayingRef.current,
          }),
        ).catch(() => null)
        const queued = Boolean(queuedState)
        logNative(
          'info',
          `fila ${queued ? 'pronta' : 'falhou'} · ${current.title} · autoPlay=${
            isPlayingRef.current
          } · atual ${queuedState?.assetId ?? '—'}`,
        )

        // Motor sem fila (versão antiga do plugin): toca a faixa no modo simples,
        // para a música sair de qualquer maneira.
        if (!queued) {
          nativeQueueActiveRef.current = false
          // Motor sem fila: um só player, e só o desta faixa.
          await stopNativeOthers(current.id)
          await NativeAudio.preload(nativeItem(current, headSrc)).catch(() => {})
          if (intentRef.current.play) {
            await NativeAudio.play({ assetId: current.id }).catch(() => {})
          }
        }

        // Se carregou em pausa enquanto a faixa carregava, o setQueue pode já ter
        // arrancado: volta a calar. Sem isto a música "não parava".
        if (!intentRef.current.play) {
          await NativeAudio.pause({ assetId: current.id }).catch(() => {})
        } else if (queueGenerationRef.current === generation) {
          // Faixa nova a tocar: os players antigos são libertados aqui (o plugin só
          // pára o que considera atual e volta a preparar o resto, que arrancava
          // sozinho por cima da nova).
          releaseNativeOthers(current.id, queuedState?.assetId)
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
        if (added) {
          nativeQueuedRef.current.add(id)
          nativeKnownRef.current.add(id)
        }
      }
    })()
  }, [
    current,
    order,
    nativePlatform,
    nativeReady,
    usesIframe,
    queueNonce,
    silenceNativeOthers,
    stopNativeOthers,
    releaseNativeOthers,
  ])

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

  // Vigilante: enquanto toca, nada além da faixa atual pode soar. Apanha os players
  // que a fila do motor arrancou por trás (era isto que deixava duas músicas juntas).
  // Aqui só se cala (pause): libertar um player a meio de uma troca deixaria a faixa
  // que o motor considera atual sem player nenhum. A libertação é feita com calma
  // logo a seguir a cada arranque.
  useEffect(() => {
    if (!nativePlatform || !isPlaying || usesIframe) return
    let ticks = 0
    const timer = window.setInterval(() => {
      const { order: list, pos: index } = stateRef.current
      const active = index >= 0 ? list[index] : null
      // Amostra do motor a cada ~4 s: diz se a faixa do ecrã está mesmo a andar.
      ticks += 1
      if (active && ticks % 3 === 0) {
        void NativeAudio.getPlaybackState({ assetId: active })
          .then((snapshot) =>
            logNative(
              'info',
              `amostra · ${secsText(snapshot.currentTime)}/${secsText(snapshot.duration)} · ${
                snapshot.isPlaying ? 'a tocar' : 'parado'
              }`,
            ),
          )
          .catch((error: unknown) =>
            logNative(
              'error',
              `amostra → ${error instanceof Error ? error.message : String(error)}`,
            ),
          )
      }
      nativePlayingRef.current.forEach((assetId) => {
        if (assetId === active) return
        nativePlayingRef.current.delete(assetId)
        void NativeAudio.pause({ assetId }).catch(() => {})
      })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [nativePlatform, isPlaying, usesIframe])

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

  // O motor pode aceitar a faixa e ficar mudo a 0:00 (URL sem som, extração falhada):
  // a barra ficava parada e a música nunca passava à seguinte. Aqui a app tenta
  // recomeçar a faixa e, se continuar em silêncio, salta à frente.
  useEffect(() => {
    if (!nativePlatform || !nativeReady || usesIframe || !current || !isPlaying) return
    const trackId = current.id
    let cancelled = false
    const timers: number[] = []

    const stalled = async () => {
      if (cancelled || !intentRef.current.play) return false
      const state = await NativeAudio.getPlaybackState().catch(() => null)
      if (cancelled || !state) return false
      // Só é "mudo" se não está a tocar nem avançou: em pausa a posição é > 0.
      return !state.isPlaying && (state.currentTime ?? 0) < 0.3
    }

    const heal = async () => {
      if (!(await stalled())) return
      const state = await NativeAudio.getPlaybackState().catch(() => null)
      const assetId = state?.assetId ?? nativeLoadedRef.current
      if (cancelled || !assetId) return
      await NativeAudio.play({ assetId, time: 0 }).catch(() => {})
      timers.push(
        window.setTimeout(() => {
          void (async () => {
            if (!(await stalled())) return
            failedTracksRef.current.add(trackId)
            setPlayerNotice({
              message: `Não consegui tocar “${current.title}”. A passar à seguinte…`,
            })
            nativeQueueActiveRef.current = false
            nativeQueuedRef.current = new Set()
            queueGenerationRef.current += 1
            endedRef.current()
          })()
        }, 5000),
      )
    }

    timers.push(window.setTimeout(() => void heal(), 3500))
    return () => {
      cancelled = true
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [current, isPlaying, nativePlatform, nativeReady, usesIframe])

  const handleEnded = useCallback(() => {
    const { repeat: mode } = stateRef.current
    if (nativeQueueActiveRef.current) return
    if (mode === 'one') {
      if (!usesIframeRef.current && Capacitor.isNativePlatform()) {
        const assetId = nativeLoadedRef.current
        if (assetId) {
          silenceNativeOthers(assetId)
          setCurrentTime(0)
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
