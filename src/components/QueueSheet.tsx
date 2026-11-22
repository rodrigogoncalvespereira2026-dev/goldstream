import { useMemo, useState } from 'react'
import { ALBUMS, PLAYLISTS, getTrack } from '../lib/catalog'
import { cx, plural } from '../lib/format'
import { usePlayer } from '../lib/player'
import { CoverImage } from './CoverImage'
import { MusicNoteIcon, ShuffleIcon, TimerIcon } from './Icons'

const TIMER_OPTIONS = [5, 10, 15, 30, 45, 60]

/** Folha da fila: fila toda, modo aleatório e temporizador de sono. */
export function QueueSheet({ onClose }: { onClose: () => void }) {
  const {
    queue,
    queueIndex,
    jumpTo,
    removeFromQueue,
    shuffle,
    toggleShuffle,
    sleepEndsAt,
    startSleepTimer,
    cancelSleepTimer,
  } = usePlayer()
  const [showTimer, setShowTimer] = useState(false)

  const label = useMemo(() => {
    if (!queue.length) return 'A tua fila'
    const same = (ids: string[]) => ids.length === queue.length && ids.every((id, i) => id === queue[i])
    const album = ALBUMS.find((item) => same(item.trackIds))
    if (album) return album.title
    const playlist = PLAYLISTS.find((item) => same(item.trackIds))
    if (playlist) return playlist.name
    return 'A tua fila'
  }, [queue])

  const remaining = sleepEndsAt ? Math.max(0, Math.ceil((sleepEndsAt - Date.now()) / 60_000)) : 0

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet queue-sheet" role="dialog" aria-label="Fila" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Fila</h2>
            <p className="queue-context">A reproduzir {label}</p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Fechar fila">
            ×
          </button>
        </div>

        {queue.length === 0 ? (
          <p className="sheet-empty">A fila está vazia. Escolhe uma música para começar.</p>
        ) : (
          <ul className="queue-list">
            {queue.map((id, index) => {
              const track = getTrack(id)
              if (!track) return null
              const active = index === queueIndex
              return (
                <li key={`${id}-${index}`} className={cx('queue-row', active && 'is-current')}>
                  <button type="button" className="queue-play" onClick={() => jumpTo(id)} aria-label={`Tocar ${track.title}`}>
                    <CoverImage className="queue-art" src={track.cover} />
                    <span className="queue-text">
                      <strong>{track.title}</strong>
                      <span>{track.artist}</span>
                    </span>
                  </button>
                  {active ? (
                    <span className="queue-now">A tocar</span>
                  ) : (
                    <button
                      type="button"
                      className="queue-remove"
                      onClick={() => removeFromQueue(id)}
                      aria-label={`Tirar ${track.title} da fila`}
                    >
                      ×
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p className="queue-count">{plural(queue.length, 'música na fila', 'músicas na fila')}</p>

        {showTimer && (
          <div className="queue-timer">
            <p>Parar o áudio dentro de</p>
            <div className="chips">
              {TIMER_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="chip"
                  onClick={() => {
                    startSleepTimer(minutes)
                    setShowTimer(false)
                  }}
                >
                  {minutes} min
                </button>
              ))}
              {sleepEndsAt && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    cancelSleepTimer()
                    setShowTimer(false)
                  }}
                >
                  Desligar
                </button>
              )}
            </div>
          </div>
        )}

        <div className="queue-actions">
          <button
            type="button"
            className={cx('queue-action', shuffle && 'is-on')}
            onClick={toggleShuffle}
            aria-pressed={shuffle}
          >
            <ShuffleIcon size={20} />
            {shuffle ? 'Aleatório ligado' : 'Modo aleatório'}
          </button>
          <button
            type="button"
            className={cx('queue-action', Boolean(sleepEndsAt) && 'is-on')}
            onClick={() => setShowTimer((prev) => !prev)}
            aria-pressed={Boolean(sleepEndsAt)}
          >
            {sleepEndsAt ? <TimerIcon size={20} /> : <MusicNoteIcon size={20} />}
            {sleepEndsAt ? `Temporizador · ${remaining} min` : 'Temporizador'}
          </button>
        </div>
      </div>
    </div>
  )
}
