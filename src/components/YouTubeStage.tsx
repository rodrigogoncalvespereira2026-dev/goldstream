import { useEffect, useRef } from 'react'
import { usePlayer } from '../lib/player'

/**
 * Card com o player do YouTube. Precisa ficar visível: o YouTube não permite
 * reproduzir embeds escondidos. O nó que o YT substitui por um iframe é criado
 * fora do React para não quebrar a reconciliação.
 */
export function YouTubeStage() {
  const { current, attachStage, playerNotice } = usePlayer()
  const hostRef = useRef<HTMLDivElement>(null)
  const isYouTube = current?.provider === 'youtube'

  useEffect(() => {
    if (!isYouTube) return
    const host = hostRef.current
    if (!host) return

    const mount = document.createElement('div')
    mount.className = 'yt-stage-mount'
    host.appendChild(mount)
    attachStage(mount)

    return () => {
      attachStage(null)
      mount.remove()
    }
  }, [isYouTube, attachStage])

  if (!isYouTube) return null

  return (
    <aside className="yt-stage" aria-label="Player do YouTube">
      <header className="yt-stage-head">
        <span className="yt-stage-kicker">YouTube</span>
        <span className="yt-stage-title">{current?.title}</span>
      </header>
      <div className="yt-stage-frame" ref={hostRef} />
      {playerNotice && <p className="yt-stage-notice">{playerNotice}</p>}
    </aside>
  )
}
