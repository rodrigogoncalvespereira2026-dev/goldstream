import { useEffect, useState } from 'react'

export type Profile = { name: string }

const KEY = 'sonora:profile'
const EVENT = 'sonora:profile'
const DEFAULT: Profile = { name: 'Ouvinte' }

export const readProfile = (): Profile => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<Profile>
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    return { name: name || DEFAULT.name }
  } catch {
    return DEFAULT
  }
}

export const saveProfile = (profile: Profile): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile))
  } catch {
    /* storage indisponível */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Nome do perfil partilhado entre o ecrã do perfil, a barra de topo e o menu. */
export function useProfile(): [Profile, (profile: Profile) => void] {
  const [profile, setProfile] = useState<Profile>(readProfile)

  useEffect(() => {
    const sync = () => setProfile(readProfile())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return [profile, saveProfile]
}

export const initialOf = (name: string): string => (name.trim()[0] ?? 'O').toUpperCase()
