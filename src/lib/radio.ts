import type { Track } from './catalog'
import { searchYouTubeSongs, YOUTUBE_API_KEY } from './youtube'

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/**
 * Rádio do artista: começa pelas faixas do próprio artista e continua com o que a
 * busca devolve de parecido, misturado — para não soar sempre à mesma ordem.
 */
export async function artistRadio(artist: string, signal?: AbortSignal): Promise<Track[]> {
  const name = artist.trim()
  if (name.length < 2) return []

  const found = await searchYouTubeSongs(name, YOUTUBE_API_KEY, signal, 30)
  if (!found.length) return []

  const key = normalize(name)
  const own = found.filter(
    (track) => normalize(track.artist).includes(key) || normalize(track.title).includes(key),
  )
  const rest = found.filter((track) => !own.includes(track))

  const head = own.slice(0, 6)
  const tail = [...own.slice(6), ...rest].sort(() => Math.random() - 0.5)
  return [...head, ...tail].slice(0, 30)
}
