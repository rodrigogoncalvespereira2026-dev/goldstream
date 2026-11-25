import { Capacitor } from '@capacitor/core'
import { listAccounts, type Account } from './account'
import { readPlaylists } from './userPlaylists'
import { readStats, type Stats } from './stats'
import { ALBUMS, GENRES, PLAYLISTS, TRACKS, getTrack } from './catalog'
import { versaoInstalada } from './update'

/** Única conta com acesso ao painel de administração. */
export const ADMIN_EMAIL = 'rgp200903@gmail.com'

export const isAdmin = (account: Account | null): boolean =>
  Boolean(account && account.email.trim().toLowerCase() === ADMIN_EMAIL)

export type AdminConta = {
  id: string
  name: string
  email: string
  criadaEm: number
  atual: boolean
  gostos: number
  reproducoes: number
  segundos: number
}

export type AdminSnapshot = {
  contas: AdminConta[]
  totalContas: number
  playlists: { total: number; musicas: number; maior: string; maiorMusicas: number }
  gostos: number
  estatisticas: Stats
  hojeMinutos: number
  semanaMinutos: number
  sequencia: number
  topFaixas: { id: string; titulo: string; artista: string; reproducoes: number }[]
  catalogo: { faixas: number; albums: number; playlists: number; generos: number }
  armazenamento: { total: number; chaves: { chave: string; bytes: number }[] }
  app: { versao: string; plataforma: string; motor: string }
}

const BYTES = (texto: string): number => new TextEncoder().encode(texto).length

export const formatBytes = (value: number): string => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

const today = (): string => dayKey(new Date())

const dayBefore = (iso: string): string => {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year || 1970, (month || 1) - 1, day || 1)
  date.setDate(date.getDate() - 1)
  return dayKey(date)
}

/** Dias seguidos com audição (hoje só conta se já houver segundos hoje). */
const sequenciaDe = (days: Record<string, number>): number => {
  let cursor = today()
  if (!days[cursor]) cursor = dayBefore(cursor)
  let total = 0
  while (days[cursor]) {
    total += 1
    cursor = dayBefore(cursor)
  }
  return total
}

const ultimosSete = (days: Record<string, number>): number => {
  let total = 0
  let cursor = today()
  for (let index = 0; index < 7; index += 1) {
    total += days[cursor] ?? 0
    cursor = dayBefore(cursor)
  }
  return total
}

const parseJSON = (raw: string | null | undefined): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

const contarGostos = (raw: string | null | undefined): number => {
  const parsed = parseJSON(raw)
  return Array.isArray(parsed) ? parsed.length : 0
}

const lerEstatisticas = (
  raw: string | null | undefined,
): { reproducoes: number; segundos: number } => {
  const parsed = parseJSON(raw)
  if (!parsed || typeof parsed !== 'object') return { reproducoes: 0, segundos: 0 }
  const value = parsed as { plays?: unknown; seconds?: unknown }
  return { reproducoes: Number(value.plays) || 0, segundos: Number(value.seconds) || 0 }
}

const lerArmazenamento = (): { total: number; chaves: { chave: string; bytes: number }[] } => {
  const chaves: { chave: string; bytes: number }[] = []
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const chave = localStorage.key(index)
      if (!chave || !chave.startsWith('sonora:')) continue
      const valor = localStorage.getItem(chave) ?? ''
      chaves.push({ chave, bytes: BYTES(valor) + BYTES(chave) })
    }
  } catch {
    /* storage indisponível */
  }
  chaves.sort((a, b) => b.bytes - a.bytes)
  return { total: chaves.reduce((soma, item) => soma + item.bytes, 0), chaves }
}

/**
 * Resumo do painel. Tudo vem do que está guardado neste aparelho: as contas
 * vivem em `localStorage`, não há servidor, por isso não existem totais de
 * outros telemóveis para mostrar.
 */
export function readAdminSnapshot(account: Account | null): AdminSnapshot {
  const estatisticas = readStats()
  const playlists = readPlaylists()

  const contas = listAccounts().map((item) => {
    const atual = item.id === account?.id
    const stats = atual
      ? { reproducoes: estatisticas.plays, segundos: estatisticas.seconds }
      : lerEstatisticas(item.data['sonora:stats'])
    let gostos = 0
    if (atual) {
      try {
        gostos = contarGostos(localStorage.getItem('sonora:liked'))
      } catch {
        gostos = 0
      }
    } else {
      gostos = contarGostos(item.data['sonora:liked'])
    }
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      criadaEm: item.createdAt,
      atual,
      gostos,
      reproducoes: stats.reproducoes,
      segundos: stats.segundos,
    }
  })

  let musicas = 0
  let maior = ''
  let maiorMusicas = 0
  playlists.forEach((item) => {
    const total = Array.isArray(item.trackIds) ? item.trackIds.length : 0
    musicas += total
    if (total > maiorMusicas) {
      maiorMusicas = total
      maior = item.name
    }
  })

  const topFaixas = Object.entries(estatisticas.tracks)
    .filter(([, valor]) => valor.plays > 0 || valor.seconds >= 20)
    .sort((a, b) => b[1].plays - a[1].plays || b[1].seconds - a[1].seconds)
    .slice(0, 5)
    .flatMap(([id, valor]) => {
      const faixa = getTrack(id)
      return faixa
        ? [{ id, titulo: faixa.title, artista: faixa.artist, reproducoes: valor.plays }]
        : []
    })

  const plataforma = Capacitor.isNativePlatform()
    ? Capacitor.getPlatform() === 'android'
      ? 'APK (Android)'
      : Capacitor.getPlatform()
    : 'Site (navegador)'

  return {
    contas,
    totalContas: contas.length,
    playlists: { total: playlists.length, musicas, maior, maiorMusicas },
    gostos: contarGostos(
      (() => {
        try {
          return localStorage.getItem('sonora:liked')
        } catch {
          return null
        }
      })(),
    ),
    estatisticas,
    hojeMinutos: Math.round((estatisticas.days[today()] ?? 0) / 60),
    semanaMinutos: Math.round(ultimosSete(estatisticas.days) / 60),
    sequencia: sequenciaDe(estatisticas.days),
    topFaixas,
    catalogo: {
      faixas: TRACKS.length,
      albums: ALBUMS.length,
      playlists: PLAYLISTS.length,
      generos: GENRES.length,
    },
    armazenamento: lerArmazenamento(),
    app: {
      versao: versaoInstalada().nome,
      plataforma,
      motor: Capacitor.isPluginAvailable('NativeAudio') ? 'Nativo' : 'Navegador',
    },
  }
}
