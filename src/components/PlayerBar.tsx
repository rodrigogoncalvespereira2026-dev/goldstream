import { formatTime } from '../lib/format'
import { usePlayer, usePlayerTime } from '../lib/player'
import { Slider } from './Slider'
import { CoverImage } from './CoverImage'
import {
  HeartIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
} from './Icons'
import { cx } from '../lib/format'

export function PlayerBar() {
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
    changeVolume,
    toggleMute,
    muted,
    volume,
    isLiked,
    toggleLike,
  } = usePlayer()
  const { currentTime, duration, seek } = usePlayerTime()

  const liked = current ? isLiked(current.id) : false
  const effectiveVolume = muted ? 0 : volume

  return (
    <footer className="player">
      <div className="player-left">
        {current ? (
          <>
            <CoverImage className="player-art" src={current.cover} loading="eager" />
            <div className="player-meta">
              <span className="player-title">{current.title}</span>
              <span className="player-artist">{current.artist}</span>
            </div>
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
          <div className="player-empty">
            <span className="player-empty-title">Nada tocando</span>
            <span className="player-empty-sub">Escolha uma música para começar</span>
          </div>
        )}
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button
            type="button"
            className={cx('icon-button', shuffle && 'is-on')}
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
            className={cx('icon-button', repeat !== 'off' && 'is-on')}
            onClick={cycleRepeat}
            aria-label={
              repeat === 'one'
                ? 'Repetir esta faixa'
                : repeat === 'all'
                  ? 'Repetir fila'
                  : 'Repetir desligado'
            }
            aria-pressed={repeat !== 'off'}
            title={
              repeat === 'one' ? 'Repetindo a faixa' : repeat === 'all' ? 'Repetindo a fila' : 'Repetir'
            }
          >
            {repeat === 'one' ? <RepeatOneIcon size={19} /> : <RepeatIcon size={19} />}
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
  )
}
