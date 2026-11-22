import { useEffect, useState } from 'react'

export type Profile = { name: string; photo?: string }

const KEY = 'sonora:profile'
const EVENT = 'sonora:profile'
const DEFAULT: Profile = { name: 'Ouvinte' }

export const readProfile = (): Profile => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<Profile>
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    const photo =
      typeof parsed.photo === 'string' && parsed.photo.startsWith('data:image')
        ? parsed.photo
        : undefined
    return { name: name || DEFAULT.name, photo }
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

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não consegui ler a imagem.'))
    reader.readAsDataURL(file)
  })

/** Lê a foto escolhida, recorta ao centro em quadrado e reduz para o avatar. */
export async function photoFromFile(file: File, size = 320): Promise<string> {
  const url = await readAsDataUrl(file)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Essa imagem não abriu.'))
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return url

  const side = Math.min(image.width, image.height)
  context.drawImage(
    image,
    (image.width - side) / 2,
    (image.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  )
  return canvas.toDataURL('image/jpeg', 0.82)
}
