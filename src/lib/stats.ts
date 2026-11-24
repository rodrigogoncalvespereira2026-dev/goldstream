import { useEffect, useState } from 'react'

export type TrackStats = { plays: number; seconds: number }

export type Stats = {
  plays: number
  seconds: number
  tracks: Record<string, TrackStats>
  days: Record<string, number>
}

const KEY = 'sonora:stats'
const EVENT = 'sonora:stats'
const EMPTY: Stats = { plays: 0, seconds: 0, tracks: {}, days: {} }

export const readStats = (): Stats => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<Stats>
    return {
      plays: Number(parsed.plays) || 0,
      seconds: Number(parsed.seconds) || 0,
      tracks:
        parsed.tracks && typeof parsed.tracks === 'object'
          ? (parsed.tracks as Record<string, TrackStats>)
          : {},
      days:
        parsed.days && typeof parsed.days === 'object'
          ? (parsed.days as Record<string, number>)
          : {},
    }
  } catch {
    return EMPTY
  }
}

const write = (stats: Stats): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats))
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

const today = (): string => {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Segundos ouvidos ainda por gravar. O player soma a cada 5 s, mas gravar no
 * localStorage lê e reescreve o registo inteiro de forma síncrona: no telemóvel
 * isso bloqueava a thread do WebView e o player engasgava. Fica em memória e
 * vai para disco de 20 em 20 segundos (ou ao pausar/sair da app).
 */
type Pending = {
  seconds: Record<string, number>
  total: number
  days: Record<string, number>
}

const emptyPending = (): Pending => ({ seconds: {}, total: 0, days: {} })

let pending: Pending = emptyPending()
let flushTimer: number | null = null

/** Grava o que está pendente. Chamado ao pausar, ao trocar de faixa e ao fechar. */
export const flushStats = (): void => {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pending.total <= 0) return
  const seconds = pending.seconds
  const days = pending.days
  const total = pending.total
  pending = emptyPending()
  const stats = readStats()
  Object.entries(seconds).forEach(([id, value]) => {
    const track = stats.tracks[id] ?? { plays: 0, seconds: 0 }
    track.seconds += value
    stats.tracks[id] = track
  })
  stats.seconds += total
  Object.entries(days).forEach(([day, value]) => {
    stats.days[day] = (stats.days[day] ?? 0) + value
  })
  write(stats)
}

const scheduleFlush = (): void => {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(flushStats, 20000)
}

/** Soma os segundos ouvidos a uma faixa e ao dia de hoje (grava em lote). */
export const addListening = (trackId: string, seconds: number): void => {
  if (!trackId || !Number.isFinite(seconds) || seconds <= 0) return
  pending.seconds[trackId] = (pending.seconds[trackId] ?? 0) + seconds
  pending.total += seconds
  const day = today()
  pending.days[day] = (pending.days[day] ?? 0) + seconds
  scheduleFlush()
}

/** Conta uma reprodução (o player só chama depois de 20 s ouvidos). */
export const addPlay = (trackId: string): void => {
  if (!trackId) return
  // Não perder segundos pendentes: o registo vai ser reescrito já a seguir.
  flushStats()
  const stats = readStats()
  const track = stats.tracks[trackId] ?? { plays: 0, seconds: 0 }
  track.plays += 1
  stats.tracks[trackId] = track
  stats.plays += 1
  write(stats)
}

// Rede de segurança: nada fica por gravar quando a app vai para segundo plano.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushStats)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStats()
  })
}

export function useStats(): Stats {
  const [stats, setStats] = useState<Stats>(readStats)

  useEffect(() => {
    const sync = () => setStats(readStats())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return stats
}

export const formatListening = (seconds: number): string => {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Minutos ouvidos hoje (para o resumo do perfil). */
export const minutesToday = (stats: Stats): number =>
  Math.round((stats.days[today()] ?? 0) / 60)
