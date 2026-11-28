import { useEffect, useState } from 'react'
import { API_URL, pedir } from './api'
import { registerTracks, type Track } from './catalog'

/** Hosts que contam como TikTok (os curtos vm./vt. são seguidos pelo servidor). */
const HOSTS = /^(?:www\.|m\.)?tiktok\.com$|^(?:vm|vt)\.tiktok\.com$/i

/** Devolve o link normalizado quando o texto é um link do TikTok. */
export function parseTikTokLink(valor: string): string | null {
  const texto = valor.trim()
  if (!texto || /\s/.test(texto)) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`)
  } catch {
    return null
  }
  return HOSTS.test(url.hostname) ? url.href : null
}

export type AchadoTikTok = {
  /** O que procurar para chegar à música completa. */
  termo: string
  musica: string | null
  autor: string | null
  capa: string | null
  legenda: string | null
  link: string
}

/** O browser não pode ir ao TikTok (sem CORS): quem lê o link é o servidor. */
export const resolverTikTok = (link: string): Promise<AchadoTikTok> =>
  pedir<AchadoTikTok>(`/api/tiktok/resolver?url=${encodeURIComponent(link)}`)

/**
 * Faixa com o áudio do próprio vídeo. Quando o som é "original sound" não há
 * música com nome para procurar; o que se pode ouvir é este excerto, servido
 * pelo nosso servidor (o browser não consegue ir ao TikTok).
 */
export function trackDoSom(achado: AchadoTikTok, link: string): Track {
  const video = /\/video\/(\d+)/.exec(achado.link)?.[1] ?? link
  const track: Track = {
    id: `tiktok:${video}`,
    title: achado.musica ?? 'Som do TikTok',
    artist: achado.autor ? `${achado.autor} · TikTok` : 'TikTok',
    albumId: 'tiktok',
    albumTitle: 'TikTok',
    cover: achado.capa ?? '',
    src: `${API_URL}/api/tiktok/audio?url=${encodeURIComponent(link)}`,
    genre: 'TikTok',
    year: 0,
    position: 0,
    duration: 0,
    external: true,
  }
  registerTracks([track])
  return track
}

/* ---------- músicas que vieram do TikTok ---------- */

const CHAVE = 'sonora:tiktok'
const EVENTO = 'sonora:tiktok'
const LIMITE = 12

export type DescobertaTikTok = {
  termo: string
  musica: string
  autor: string
  capa: string
  em: number
}

const ehDescoberta = (item: unknown): item is DescobertaTikTok => {
  if (!item || typeof item !== 'object') return false
  const valor = item as Record<string, unknown>
  return typeof valor.termo === 'string' && typeof valor.musica === 'string'
}

export const lerDescobertas = (): DescobertaTikTok[] => {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const lista = bruto ? (JSON.parse(bruto) as unknown) : []
    return Array.isArray(lista) ? lista.filter(ehDescoberta).slice(0, LIMITE) : []
  } catch {
    return []
  }
}

/** Guarda a música encontrada no topo da lista "Do TikTok". */
export const guardarDescoberta = (item: Omit<DescobertaTikTok, 'em'>): void => {
  const termo = item.termo.trim()
  if (!termo) return
  const resto = lerDescobertas().filter(
    (descoberta) => descoberta.termo.toLowerCase() !== termo.toLowerCase(),
  )
  const lista = [{ ...item, termo, em: Date.now() }, ...resto].slice(0, LIMITE)
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista))
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENTO))
}

export function useDescobertasTikTok(): [DescobertaTikTok[], typeof guardarDescoberta] {
  const [lista, setLista] = useState<DescobertaTikTok[]>(lerDescobertas)

  useEffect(() => {
    const sincronizar = () => setLista(lerDescobertas())
    window.addEventListener(EVENTO, sincronizar)
    return () => window.removeEventListener(EVENTO, sincronizar)
  }, [])

  return [lista, guardarDescoberta]
}
