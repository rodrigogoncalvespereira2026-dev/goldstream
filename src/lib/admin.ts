import { Capacitor } from '@capacitor/core'
import { readPlaylists } from './userPlaylists'
import { readStats, type Stats } from './stats'
import { ALBUMS, GENRES, PLAYLISTS, TRACKS, getTrack } from './catalog'
import { versaoInstalada } from './update'
import { pedir } from './api'

/** Única conta com acesso ao painel de administração. */
export const ADMIN_EMAIL = 'rgp200903@gmail.com'

export const isAdmin = (account: { email: string } | null): boolean =>
  Boolean(account && account.email.trim().toLowerCase() === ADMIN_EMAIL)

export type AdminSnapshot = {
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

export type ContaServidor = {
  id: string
  nome: string
  email: string
  criadaEm: string | null
  playlists: number
  musicas: number
  gostos: number
  reproducoes: number
  segundos: number
}

export type ResumoServidor = {
  totalContas: number
  totalPlaylists: number
  totalMusicas: number
  totalGostos: number
  totalReproducoes: number
  totalSegundos: number
  contas: ContaServidor[]
}

/** Números de todas as contas, vindos da base de dados MongoDB. */
export const lerResumoServidor = (token: string): Promise<ResumoServidor> =>
  pedir<ResumoServidor>('/api/admin/resumo', { token })

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

/** Números deste aparelho (o total de todas as contas vem do servidor). */
export function readAdminSnapshot(): AdminSnapshot {
  const estatisticas = readStats()
  const playlists = readPlaylists()

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

  let gostos = 0
  try {
    gostos = contarGostos(localStorage.getItem('sonora:liked'))
  } catch {
    gostos = 0
  }

  return {
    playlists: { total: playlists.length, musicas, maior, maiorMusicas },
    gostos,
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
