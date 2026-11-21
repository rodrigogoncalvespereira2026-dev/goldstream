import { useEffect, useRef } from 'react'
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
  }, [isYouTube, attachStage])

  if (!isYouTube) return null

  return (
    <>
      <div className="yt-sink" ref={hostRef} aria-hidden="true" />
      {playerNotice && (
        <p className="player-toast" role="status">
          {playerNotice}
        </p>
      )}
    </>
  )
}
