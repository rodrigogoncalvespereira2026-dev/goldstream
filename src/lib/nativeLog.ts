import { Capacitor } from '@capacitor/core'

export type NativeLogKind = 'info' | 'event' | 'error'

export type NativeLogEntry = { id: number; time: string; kind: NativeLogKind; text: string }

/** O registo só faz sentido dentro do APK (no navegador não há motor nativo). */
export const nativeLogVisible = Capacitor.isNativePlatform()

const MAX_ENTRIES = 80
let entries: NativeLogEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

const clock = (): string => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/** Tempo legível (m:ss): usado para o tempo e a duração do motor. */
export const secsText = (value?: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—'
  const total = Math.round(value)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Acrescenta uma linha ao registo visível no ecrã do telemóvel. */
export function logNative(kind: NativeLogKind, text: string): void {
  if (!nativeLogVisible) return
  entries = [...entries, { id: nextId, time: clock(), kind, text }].slice(-MAX_ENTRIES)
  nextId += 1
  listeners.forEach((notify) => notify())
}

/** Regista a falha de uma chamada ao motor nativo e deixa o erro seguir o caminho. */
export function logNativeCall<T>(label: string, promise: Promise<T>): Promise<T> {
  if (!nativeLogVisible) return promise
  return promise.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    logNative('error', `${label} → ${message}`)
    throw error
  })
}

export function getNativeLog(): NativeLogEntry[] {
  return entries
}

export function clearNativeLog(): void {
  entries = []
  listeners.forEach((notify) => notify())
}

export function subscribeNativeLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
