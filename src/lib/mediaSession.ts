import { MediaSession } from '@capgo/capacitor-media-session'
import type { Track } from './catalog'

/**
 * Mostra a faixa nas notificações / ecrã bloqueado e mantém o serviço nativo vivo,
 * para a música continuar a tocar quando se sai da app ou se desliga o ecrã.
 */

type SessionHandlers = {
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
}

const absoluteUrl = (src: string): string => {
  try {
    return new URL(src, window.location.origin).href
  } catch {
    return src
  }
}

/** O plugin não existe no navegador comum: falhas aqui nunca podem quebrar o player. */
export async function publishTrack(track: Track | null): Promise<void> {
  try {
    if (!track) {
      await MediaSession.setPlaybackState({ playbackState: 'none' })
      return
    }
    await MediaSession.setMetadata({
      title: track.title,
      artist: track.artist,
      album: track.albumTitle,
      artwork: [{ src: absoluteUrl(track.cover), sizes: '512x512', type: 'image/jpeg' }],
    })
  } catch {
    /* sem controles de media disponíveis */
  }
}

export async function publishState(playing: boolean): Promise<void> {
  try {
    await MediaSession.setPlaybackState({ playbackState: playing ? 'playing' : 'paused' })
  } catch {
    /* sem controles de media disponíveis */
  }
}

export async function publishPosition(position: number, duration: number): Promise<void> {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return
  try {
    await MediaSession.setPositionState({
      position: Math.min(Math.max(0, position), duration),
      duration,
      playbackRate: 1,
    })
  } catch {
    /* sem controles de media disponíveis */
  }
}

export async function bindSessionHandlers(handlers: SessionHandlers): Promise<void> {
  const register = async (action: 'play' | 'pause' | 'nexttrack' | 'previoustrack', run: () => void) => {
    try {
      await MediaSession.setActionHandler({ action }, run)
    } catch {
      /* ação não suportada nesta plataforma */
    }
  }

  await register('play', handlers.play)
  await register('pause', handlers.pause)
  await register('nexttrack', handlers.next)
  await register('previoustrack', handlers.prev)

  try {
    await MediaSession.setActionHandler({ action: 'seekto' }, (details) => {
      if (typeof details.seekTime === 'number') handlers.seek(details.seekTime)
    })
  } catch {
    /* ação não suportada nesta plataforma */
  }
}
