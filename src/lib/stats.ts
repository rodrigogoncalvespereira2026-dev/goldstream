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

/** Soma os segundos ouvidos a uma faixa e ao dia de hoje. */
export const addListening = (trackId: string, seconds: number): void => {
  if (!trackId || !Number.isFinite(seconds) || seconds <= 0) return
  const stats = readStats()
  const track = stats.tracks[trackId] ?? { plays: 0, seconds: 0 }
  track.seconds += seconds
  stats.tracks[trackId] = track
  stats.seconds += seconds
  const day = today()
  stats.days[day] = (stats.days[day] ?? 0) + seconds
  write(stats)
}

/** Conta uma reprodução (o player só chama depois de 20 s ouvidos). */
export const addPlay = (trackId: string): void => {
  if (!trackId) return
  const stats = readStats()
  const track = stats.tracks[trackId] ?? { plays: 0, seconds: 0 }
  track.plays += 1
  stats.tracks[trackId] = track
  stats.plays += 1
  write(stats)
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
