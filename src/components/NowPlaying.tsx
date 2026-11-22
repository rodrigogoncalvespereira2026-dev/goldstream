import { useEffect, useRef, useState } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { getAlbum } from '../lib/catalog'
import { cx, formatTime } from '../lib/format'
import { usePlayer, usePlayerTime } from '../lib/player'
import { CoverImage } from './CoverImage'
import { Slider } from './Slider'
import {
  ChevronDownIcon,
  HeartIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VideoIcon,
} from './Icons'

type NowPlayingProps = {
  open: boolean
  onClose: () => void
}

/** Ecrã inteiro "Agora tocando" — usado apenas no telemóvel. */
export function NowPlaying({ open, onClose }: NowPlayingProps) {
  const {
    current,
    isPlaying,
    toggle,
    next,
    prev,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    isLiked,
    toggleLike,
    openWatch,
  } = usePlayer()
  const { currentTime, duration, seek } = usePlayerTime()

  // Deslizar: puxar para baixo fecha o ecrã, como no Spotify.
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)

  const resetDrag = () => {
    setDragging(false)
    setDragY(0)
  }

  const handleTouchStart = (event: ReactTouchEvent) => {
    if (event.touches.length !== 1) return
    if ((sheetRef.current?.scrollTop ?? 0) > 0) return
    dragStart.current = event.touches[0].clientY
    setDragging(true)
  }

  const handleTouchMove = (event: ReactTouchEvent) => {
    if (dragStart.current === null) return
    const delta = event.touches[0].clientY - dragStart.current
    // Para baixo acompanha o dedo; para cima oferece resistência.
    setDragY(delta > 0 ? delta : delta * 0.25)
  }

  const handleTouchEnd = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    if (dragY > 110) {
      setDragging(false)
      setClosing(true)
      window.setTimeout(() => {
        setClosing(false)
        setDragY(0)
        onClose()
      }, 200)
      return
    }
    resetDrag()
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const liked = current ? isLiked(current.id) : false
  const tint = current ? (getAlbum(current.albumId)?.tint ?? '#1f1f1f') : '#1f1f1f'

  return (
    <div
      ref={sheetRef}
      className={cx('now-playing', dragging && 'is-dragging')}
      role="dialog"
      aria-modal="true"
      aria-label="Agora tocando"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetDrag}
      style={{
        background: `linear-gradient(180deg, ${tint} 0%, #0a0a0a 62%)`,
        transform: closing ? 'translateY(100%)' : `translateY(${Math.max(0, dragY)}px)`,
        transition: dragging ? 'none' : 'transform 0.22s ease',
      }}
    >
      <div className="np-inner">
        <div className="np-top">
          <button type="button" className="np-round" onClick={onClose} aria-label="Minimizar player">
            <ChevronDownIcon size={26} />
          </button>
          <span className="np-kicker">Agora tocando</span>
          <span className="np-round-spacer" aria-hidden="true" />
        </div>

        {current ? (
          <>
            <div className="np-art">
              <CoverImage src={current.cover} loading="eager" />
            </div>

            <div className="np-meta">
              <div className="np-text">
                <h2 className="np-title">{current.title}</h2>
                <p className="np-artist">{current.artist}</p>
              </div>
              <button
                type="button"
                className={cx('np-like', liked && 'is-liked')}
                onClick={() => toggleLike(current.id)}
                aria-label={liked ? 'Remover das músicas curtidas' : 'Curtir música'}
                aria-pressed={liked}
              >
                <HeartIcon size={24} filled={liked} />
              </button>
            </div>

            {current.provider === 'youtube' && current.videoId && (
              <button type="button" className="np-watch" onClick={() => openWatch(current.videoId as string)}>
                <VideoIcon size={17} />
                Ver vídeo
              </button>
            )}

            <div className="np-progress">
              <Slider
                value={currentTime}
                max={duration || 1}
                onChange={seek}
                ariaLabel="Progresso da música"
              />
              <div className="np-times">
                <span>{formatTime(currentTime)}</span>
                <span>{duration ? formatTime(duration) : '0:00'}</span>
              </div>
            </div>

            <div className="np-controls">
              <button
                type="button"
                className={cx('np-control', shuffle && 'is-on')}
                onClick={toggleShuffle}
                aria-label="Modo aleatório"
                aria-pressed={shuffle}
              >
                <ShuffleIcon size={22} />
              </button>
              <button type="button" className="np-control" onClick={prev} aria-label="Faixa anterior">
                <PrevIcon size={30} />
              </button>
              <button
                type="button"
                className="np-play"
                onClick={toggle}
                aria-label={isPlaying ? 'Pausar' : 'Tocar'}
              >
                {isPlaying ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
              </button>
              <button type="button" className="np-control" onClick={next} aria-label="Próxima faixa">
                <NextIcon size={30} />
              </button>
              <button
                type="button"
                className={cx('np-control', repeat !== 'off' && 'is-on')}
                onClick={cycleRepeat}
                aria-label={
                  repeat === 'one'
                    ? 'Repetir esta faixa'
                    : repeat === 'all'
                      ? 'Repetir fila'
                      : 'Repetir desligado'
                }
                aria-pressed={repeat !== 'off'}
              >
                {repeat === 'one' ? <RepeatOneIcon size={22} /> : <RepeatIcon size={22} />}
              </button>
            </div>

            <p className="np-source">
              {current.provider === 'youtube' ? 'A tocar no YouTube' : 'A tocar na goldenstream'}
            </p>
          </>
        ) : (
          <div className="np-empty">
            <h2>Nada tocando</h2>
            <p>Escolha uma música para começar.</p>
          </div>
        )}
      </div>
    </div>
  )
}
