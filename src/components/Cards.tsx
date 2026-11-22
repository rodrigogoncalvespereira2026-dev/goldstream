import { useState, type ReactNode } from 'react'
import type { Album, Playlist, Track } from '../lib/catalog'
import { cx, formatTime, plural } from '../lib/format'
import { usePlayer } from '../lib/player'
import { HeartIcon, PauseIcon, PlayIcon, PlusIcon, VideoIcon } from './Icons'
import { CoverImage } from './CoverImage'
import { PlaylistSheet } from './PlaylistSheet'

type MediaCardProps = {
  title: string
  subtitle: string
  cover: string
  onOpen: () => void
  onPlay: () => void
  isCurrent?: boolean
  isPlaying?: boolean
  round?: boolean
}

export function MediaCard({
  title,
  subtitle,
  cover,
  onOpen,
  onPlay,
  isCurrent,
  isPlaying,
  round,
}: MediaCardProps) {
  return (
    <article
      className="card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className={cx('card-art', round && 'is-round')}>
        <img src={cover} alt={`Capa de ${title}`} loading="lazy" />
        <button
          type="button"
          className="card-play"
          aria-label={isCurrent && isPlaying ? `Pausar ${title}` : `Tocar ${title}`}
          onClick={(event) => {
            event.stopPropagation()
            onPlay()
          }}
        >
          {isCurrent && isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
        </button>
      </div>
      <h3 className="card-title">{title}</h3>
      <p className="card-subtitle">{subtitle}</p>
    </article>
  )
}

export function AlbumCard({ album, onOpen }: { album: Album; onOpen: () => void }) {
  const { current, isPlaying, playQueue, toggle } = usePlayer()
  const active = current?.albumId === album.id
  return (
    <MediaCard
      title={album.title}
      subtitle={`${album.year} · ${album.artist}`}
      cover={album.cover}
      isCurrent={active}
      isPlaying={isPlaying}
      onOpen={onOpen}
      onPlay={() => (active ? toggle() : playQueue(album.trackIds, album.trackIds[0]))}
    />
  )
}

export function PlaylistCard({ playlist, onOpen }: { playlist: Playlist; onOpen: () => void }) {
  const { current, isPlaying, playQueue, toggle } = usePlayer()
  const active = Boolean(current && playlist.trackIds.includes(current.id))
  return (
    <MediaCard
      title={playlist.name}
      subtitle={`${plural(playlist.trackIds.length, 'música', 'músicas')} · ${playlist.owner}`}
      cover={playlist.cover}
      isCurrent={active}
      isPlaying={isPlaying}
      onOpen={onOpen}
      onPlay={() => (active ? toggle() : playQueue(playlist.trackIds, playlist.trackIds[0]))}
    />
  )
}

type TrackRowProps = {
  track: Track
  index: number
  onPlay: () => void
  showCover?: boolean
  showAlbum?: boolean
  /** Quando existe, mostra o botão de tirar (ex.: dentro de uma playlist). */
  onRemove?: () => void
}

export function TrackRow({
  track,
  index,
  onPlay,
  showCover,
  showAlbum = true,
  onRemove,
}: TrackRowProps) {
  const { current, isPlaying, toggleLike, isLiked, durations, openWatch } = usePlayer()
  const [sheetOpen, setSheetOpen] = useState(false)
  const active = current?.id === track.id
  const liked = isLiked(track.id)
  const length = durations[track.id] ?? track.duration

  return (
    <div
      className={cx('track-row', active && 'is-active')}
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPlay()
        }
      }}
    >
      <div className="track-index">
        {active && isPlaying ? (
          <span className="playing-bars" aria-label="Tocando agora">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="track-number">{index + 1}</span>
        )}
        <span className="track-hover-play">
          <PlayIcon size={14} />
        </span>
      </div>

      <div className="track-main">
        {showCover && <CoverImage className="track-cover" src={track.cover} />}
        <div className="track-text">
          <span className="track-title">{track.title}</span>
          <span className="track-artist">{track.artist}</span>
        </div>
      </div>

      {showAlbum && <div className="track-album">{track.albumTitle}</div>}

      <button
        type="button"
        className={cx('track-like', liked && 'is-liked')}
        aria-label={liked ? 'Remover das músicas curtidas' : 'Curtir música'}
        aria-pressed={liked}
        onClick={(event) => {
          event.stopPropagation()
          toggleLike(track.id)
        }}
      >
        <HeartIcon size={17} filled={liked} />
      </button>

      <div className="track-duration">
        <button
          type="button"
          className="track-add"
          aria-label={`Adicionar ${track.title} a uma playlist`}
          onClick={(event) => {
            event.stopPropagation()
            setSheetOpen(true)
          }}
        >
          <PlusIcon size={15} />
        </button>
        {onRemove && (
          <button
            type="button"
            className="track-remove"
            aria-label={`Tirar ${track.title} da playlist`}
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
        {track.provider === 'youtube' && track.videoId && (
          <button
            type="button"
            className="track-video"
            aria-label={`Ver vídeo de ${track.title}`}
            onClick={(event) => {
              event.stopPropagation()
              openWatch(track.videoId as string)
            }}
          >
            <VideoIcon size={15} />
          </button>
        )}
        <span>{length ? formatTime(length) : '–:––'}</span>
      </div>

      {sheetOpen && (
        <PlaylistSheet trackId={track.id} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  )
}

export function Section({
  title,
  note,
  action,
  onAction,
  children,
}: {
  title: string
  note?: string
  action?: string
  onAction?: () => void
  children: ReactNode
}) {
  return (
    <section className="section">
      <header className="section-head">
        <div className="section-head-left">
          <h2>{title}</h2>
          {note && <span className="section-note">{note}</span>}
        </div>
        {action && (
          <button type="button" className="text-button" onClick={onAction}>
            {action}
          </button>
        )}
      </header>
      {children}
    </section>
  )
}
