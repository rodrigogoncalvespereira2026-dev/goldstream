import { useEffect, useState } from 'react'

export type UserPlaylist = {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
}

const KEY = 'sonora:mine'
const EVENT = 'sonora:mine'

export const readPlaylists = (): UserPlaylist[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is UserPlaylist =>
        Boolean(item) &&
        typeof (item as UserPlaylist).id === 'string' &&
        typeof (item as UserPlaylist).name === 'string' &&
        Array.isArray((item as UserPlaylist).trackIds),
    )
  } catch {
    return []
  }
}

const write = (list: UserPlaylist[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

const newId = (): string => `mine_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`

export const createPlaylist = (name: string): UserPlaylist => {
  const playlist: UserPlaylist = {
    id: newId(),
    name: name.trim() || 'Nova playlist',
    trackIds: [],
    createdAt: Date.now(),
  }
  write([playlist, ...readPlaylists()])
  return playlist
}

export const renamePlaylist = (id: string, name: string): void => {
  const clean = name.trim()
  if (!clean) return
  write(readPlaylists().map((item) => (item.id === id ? { ...item, name: clean } : item)))
}

export const deletePlaylist = (id: string): void => {
  write(readPlaylists().filter((item) => item.id !== id))
}

export const addToPlaylist = (id: string, trackId: string): void => {
  write(
    readPlaylists().map((item) =>
      item.id === id && !item.trackIds.includes(trackId)
        ? { ...item, trackIds: [...item.trackIds, trackId] }
        : item,
    ),
  )
}

export const removeFromPlaylist = (id: string, trackId: string): void => {
  write(
    readPlaylists().map((item) =>
      item.id === id
        ? { ...item, trackIds: item.trackIds.filter((value) => value !== trackId) }
        : item,
    ),
  )
}

export const toggleInPlaylist = (id: string, trackId: string): void => {
  const playlist = readPlaylists().find((item) => item.id === id)
  if (!playlist) return
  if (playlist.trackIds.includes(trackId)) removeFromPlaylist(id, trackId)
  else addToPlaylist(id, trackId)
}

export function useUserPlaylists(): UserPlaylist[] {
  const [list, setList] = useState<UserPlaylist[]>(readPlaylists)

  useEffect(() => {
    const sync = () => setList(readPlaylists())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return list
}
