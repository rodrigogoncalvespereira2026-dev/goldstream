import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { usePlayer } from '../lib/player'
import { ChevronDownIcon, VideoIcon } from './Icons'

/**
 * Ecrã "Ver vídeo": mostra o vídeo do YouTube em grande. Ao abrir, o áudio da app
 * pausa (senão ouvia-se a música e o vídeo ao mesmo tempo); ao fechar, volta a tocar.
 */
export function WatchVideo() {
  const { watchVideoId, watchInline, closeWatch, current } = usePlayer()

  useEffect(() => {
    if (!watchVideoId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWatch()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [watchVideoId, closeWatch])

  // No "agora tocando" o vídeo toca no lugar da capa: a folha não abre.
  if (!watchVideoId || watchInline) return null

  const isCurrent = current?.videoId === watchVideoId
  const title = isCurrent ? current?.title ?? 'Vídeo' : 'Vídeo'

  const openOnYouTube = () => {
    const url = `https://www.youtube.com/watch?v=${watchVideoId}`
    if (Capacitor.isNativePlatform()) void Browser.open({ url })
    else window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="video-sheet" role="dialog" aria-modal="true" aria-label="Ver vídeo">
      <div className="video-top">
        <button type="button" className="np-round" onClick={() => closeWatch()} aria-label="Fechar vídeo">
          <ChevronDownIcon size={26} />
        </button>
        <span className="np-kicker">Vídeo</span>
        <button type="button" className="video-external" onClick={openOnYouTube}>
          YouTube
        </button>
      </div>

      <div className="video-frame">
        <iframe
          key={watchVideoId}
          src={`https://www.youtube.com/embed/${watchVideoId}?autoplay=1&playsinline=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      {isCurrent && current && (
        <div className="video-meta">
          <h2>{current.title}</h2>
          <p>{current.artist}</p>
          <button type="button" className="video-audio" onClick={() => closeWatch()}>
            <VideoIcon size={17} />
            Voltar a ouvir só o áudio
          </button>
        </div>
      )}
    </div>
  )
}
