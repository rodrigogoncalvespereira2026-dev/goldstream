import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../lib/player'

/**
 * O som das faixas do YouTube sai do player embutido, mas o app é de música: o
 * player fica montado fora de vista (no tamanho mínimo exigido pelo YouTube) e
 * nada de vídeo aparece na tela. O nó que o YT substitui por um iframe é criado
 * fora do React para não quebrar a reconciliação.
 */
export function YouTubeStage() {
  const { current, attachStage, playerNotice } = usePlayer()
  const hostRef = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const isYouTube = current?.provider === 'youtube'

  useEffect(() => {
    if (!isYouTube) return
    const host = hostRef.current
    if (!host) return

    const mount = document.createElement('div')
    mount.className = 'yt-sink-mount'
    host.appendChild(mount)
    attachStage(mount)

    return () => {
      attachStage(null)
      mount.remove()
    }
  }, [isYouTube, attachStage, attempt])

  return (
    <>
      {isYouTube && <div className="yt-sink" ref={hostRef} aria-hidden="true" />}
      {playerNotice && (
        <p className="player-toast" role="status">
          <span>{playerNotice.message}</span>
          {playerNotice.retry && (
            <button type="button" className="toast-retry" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </button>
          )}
        </p>
      )}
    </>
  )
}
