import { useRef, useState } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { formatTime } from '../lib/format'
import { usePlayer, usePlayerTime } from '../lib/player'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Slider } from './Slider'
import { CoverImage } from './CoverImage'
import { NowPlaying } from './NowPlaying'
import { QueueSheet } from './QueueSheet'
import { RadioButton } from './RadioButton'
import {
  HeartIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  QueueIcon,
  ShuffleIcon,
  VideoIcon,
  VolumeIcon,
} from './Icons'
import { cx } from '../lib/format'

export function PlayerBar() {
  const {
    current,
    queue,
    isPlaying,
    toggle,
    next,
    prev,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    changeVolume,
    toggleMute,
    muted,
    volume,
    isLiked,
    toggleLike,
    openWatch,
  } = usePlayer()
  const { currentTime, duration, seek } = usePlayerTime()
  const isMobile = useMediaQuery('(max-width: 760px)')
  const [expanded, setExpanded] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)

  // Deslizar a barra para cima abre o ecrã "Agora tocando".
  const touchStartY = useRef<number | null>(null)

  const handleBarTouchStart = (event: ReactTouchEvent) => {
    if (!isMobile) return
    touchStartY.current = event.touches[0]?.clientY ?? null
  }

  const handleBarTouchEnd = (event: ReactTouchEvent) => {
    if (!isMobile || touchStartY.current === null) return
    const endY = event.changedTouches[0]?.clientY ?? touchStartY.current
    const delta = endY - touchStartY.current
    touchStartY.current = null
    if (delta < -36) setExpanded(true)
  }

  const liked = current ? isLiked(current.id) : false
  const effectiveVolume = muted ? 0 : volume
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0

  return (
    <>
      <footer
        className={cx('player', isMobile && 'is-mobile')}
        onTouchStart={handleBarTouchStart}
        onTouchEnd={handleBarTouchEnd}
      >
        <div className="player-mini-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="player-left">
          {current ? (
            <>
              <button
                type="button"
                className="player-open"
                onClick={() => isMobile && setExpanded(true)}
                tabIndex={isMobile ? 0 : -1}
                aria-label={isMobile ? `Abrir player: ${current.title}` : undefined}
              >
                <CoverImage className="player-art" src={current.cover} loading="eager" />
                <span className="player-meta">
                  <span className="player-title">{current.title}</span>
                  <span className="player-artist">{current.artist}</span>
                </span>
              </button>
              <RadioButton artist={current.artist} variant="icon" />
              {current.provider === 'youtube' && current.videoId && (
                <button
                  type="button"
                  className="icon-button player-watch"
                  onClick={() => openWatch(current.videoId as string)}
                  aria-label="Ver vídeo"
                  title="Ver vídeo"
                >
                  <VideoIcon size={18} />
                </button>
              )}
              <button
                type="button"
                className={cx('icon-button', liked && 'is-liked')}
                onClick={() => toggleLike(current.id)}
                aria-label={liked ? 'Remover das músicas curtidas' : 'Curtir música'}
                aria-pressed={liked}
              >
                <HeartIcon size={18} filled={liked} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="player-open"
              onClick={() => isMobile && setExpanded(true)}
              tabIndex={isMobile ? 0 : -1}
              aria-label={isMobile ? 'Abrir player' : undefined}
            >
              <span className="player-empty">
                <span className="player-empty-title">Nada tocando</span>
                <span className="player-empty-sub">Escolha uma música para começar</span>
              </span>
            </button>
          )}
        </div>

      <div className="player-center">
        <div className="player-controls">
          <button
            type="button"
            className={cx('icon-button', 'player-shuffle', shuffle && 'is-on')}
            onClick={toggleShuffle}
            aria-label="Modo aleatório"
            aria-pressed={shuffle}
          >
            <ShuffleIcon size={19} />
          </button>
          <button type="button" className="icon-button" onClick={prev} aria-label="Faixa anterior">
            <PrevIcon size={20} />
          </button>
          <button
            type="button"
            className="play-circle"
            onClick={toggle}
            aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          >
            {isPlaying ? <PauseIcon size={19} /> : <PlayIcon size={19} />}
          </button>
          <button type="button" className="icon-button" onClick={next} aria-label="Próxima faixa">
            <NextIcon size={20} />
          </button>
          <button
            type="button"
            className={cx('icon-button', 'player-repeat', repeat !== 'off' && 'is-on', repeat === 'one' && 'repeat-one')}
            onClick={cycleRepeat}
            aria-label={
              repeat === 'one'
                ? 'Repetir esta faixa continuamente'
                : repeat === 'all'
                  ? 'Repetir fila continuamente'
                  : 'Repetir desligado'
            }
            aria-pressed={repeat !== 'off'}
            title={
              repeat === 'one' ? 'Repetindo a faixa atual' : repeat === 'all' ? 'Repetindo a fila de reprodução' : 'Modo de repetição desligado'
            }
          >
            {repeat === 'one' ? <RepeatOneIcon size={24} /> : <RepeatIcon size={24} />}
            <span className="repeat-badge">1</span>
          </button>
        </div>

        <div className="progress">
          <span className="time">{formatTime(currentTime)}</span>
          <Slider
            value={currentTime}
            max={duration || 1}
            onChange={seek}
            ariaLabel="Progresso da música"
          />
          <span className="time">{duration ? formatTime(duration) : '0:00'}</span>
        </div>
      </div>

      <div className="player-right">
        <button
          type="button"
          className={cx('icon-button', 'player-queue', queue.length > 0 && 'has-queue')}
          onClick={() => setQueueOpen(true)}
          aria-label={`Abrir fila${queue.length ? ` · ${queue.length} músicas` : ''}`}
          title="Abrir fila"
        >
          <QueueIcon size={19} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={toggleMute}
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
        >
          <VolumeIcon size={19} level={effectiveVolume === 0 ? 0 : effectiveVolume > 0.5 ? 2 : 1} />
        </button>
        <Slider
          className="volume-slider"
          value={effectiveVolume}
          max={1}
          onChange={changeVolume}
          ariaLabel="Volume"
        />
        </div>
      </footer>

      {isMobile && <NowPlaying open={expanded} onClose={() => setExpanded(false)} />}
      {!isMobile && queueOpen && <QueueSheet onClose={() => setQueueOpen(false)} />}
    </>
  )
}
