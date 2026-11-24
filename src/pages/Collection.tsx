import { useMemo } from 'react'
import {
  ALBUMS,
  GENRES,
  PLAYLISTS,
  genreAlbums,
  getAlbum,
  getTrack,
  getTracks,
} from '../lib/catalog'
import { AlbumCard, Section, TrackRow } from '../components/Cards'
import { ClockIcon, HeartIcon, MusicNoteIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { formatLongDuration, plural } from '../lib/format'
import { usePlayer } from '../lib/player'
import type { Navigate, View } from '../lib/nav'

type CollectionView = Extract<
  View,
  { type: 'album' | 'playlist' | 'liked' | 'genre' }
>

type CollectionData = {
  kicker: string
  title: string
  cover?: string
  liked?: boolean
  tint: string
  trackIds: string[]
  note?: string
  meta: string[]
  genre?: string
}

export function Collection({ view, navigate }: { view: CollectionView; navigate: Navigate }) {
  const { liked, durations, playQueue, current, isPlaying, toggle, toggleLike } = usePlayer()

  const data = useMemo<CollectionData | null>(() => {
    if (view.type === 'album') {
      const album = getAlbum(view.id)
      if (!album) return null
      const total = album.trackIds.reduce(
        (sum, id) => sum + (durations[id] ?? getTrack(id)?.duration ?? 0),
        0,
      )
      return {
        kicker: 'Álbum',
        title: album.title,
        cover: album.cover,
        tint: album.tint,
        trackIds: album.trackIds,
        note: album.description,
        meta: [
          album.artist,
          String(album.year),
          plural(album.trackIds.length, 'música', 'músicas'),
          formatLongDuration(total),
        ],
        genre: album.genre,
      }
    }

    if (view.type === 'playlist') {
      const playlist = PLAYLISTS.find((item) => item.id === view.id)
      if (!playlist) return null
      const total = playlist.trackIds.reduce(
        (sum, id) => sum + (durations[id] ?? getTrack(id)?.duration ?? 0),
        0,
      )
      return {
        kicker: 'Playlist',
        title: playlist.name,
        cover: playlist.cover,
        tint: playlist.tint,
        trackIds: playlist.trackIds,
        note: playlist.description,
        meta: [
          playlist.owner,
          plural(playlist.trackIds.length, 'música', 'músicas'),
          formatLongDuration(total),
        ],
      }
    }

    if (view.type === 'liked') {
      const total = liked.reduce(
        (sum, id) => sum + (durations[id] ?? getTrack(id)?.duration ?? 0),
        0,
      )
      return {
        kicker: 'Playlist',
        title: 'Músicas Curtidas',
        liked: true,
        tint: '#3f1d80',
        trackIds: liked,
        note: 'Tudo o que você curtiu fica guardado aqui.',
        meta: [`Você`, plural(liked.length, 'música', 'músicas'), formatLongDuration(total)],
      }
    }

    const genre = GENRES.find((item) => item.name === view.name)
    const albums = genreAlbums(view.name)
    const trackIds = albums.flatMap((album) => album.trackIds)
    const total = trackIds.reduce(
      (sum, id) => sum + (durations[id] ?? getTrack(id)?.duration ?? 0),
      0,
    )
    return {
      kicker: 'Gênero',
      title: view.name,
      cover: albums[0]?.cover ?? ALBUMS[0].cover,
      tint: genre?.from ?? '#2a2a2a',
      trackIds,
      note: `O melhor de ${view.name} na goldenstream.`,
      meta: [
        plural(albums.length, 'álbum', 'álbuns'),
        plural(trackIds.length, 'música', 'músicas'),
        formatLongDuration(total),
      ],
      genre: view.name,
    }
  }, [view, liked, durations])

  if (!data) {
    return (
      <div className="empty">
        <h3>Não encontramos essa coleção</h3>
        <p>Talvez o link esteja errado ou o conteúdo tenha saído do catálogo.</p>
      </div>
    )
  }

  const tracks = getTracks(data.trackIds)
  const playingThisCollection = Boolean(current && data.trackIds.includes(current.id) && isPlaying)

  const toggleCollection = () => {
    if (!data.trackIds.length) return
    if (current && data.trackIds.includes(current.id)) toggle()
    else playQueue(data.trackIds, data.trackIds[0])
  }

  return (
    <div>
      <div
        className="collection-hero"
        style={{ background: `linear-gradient(180deg, ${data.tint}66 0%, transparent 100%)` }}
      >
        <div className={data.liked ? 'collection-art is-liked' : 'collection-art'}>
          {data.liked ? (
            <HeartIcon size={92} filled />
          ) : data.cover ? (
            <img src={data.cover} alt={`Capa de ${data.title}`} />
          ) : (
            <MusicNoteIcon size={92} />
          )}
        </div>

        <div className="collection-info">
          <span className="collection-kicker">{data.kicker}</span>
          <h1 className="collection-title">{data.title}</h1>
          {data.note && <p className="collection-note">{data.note}</p>}
          <div className="collection-meta">
            {data.meta.map((item, index) => (
              <span key={`${item}-${index}`}>
                {index > 0 && <span className="dot">·</span>}
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="collection-actions">
        <button
          type="button"
          className="play-fab"
          onClick={toggleCollection}
          aria-label={playingThisCollection ? 'Pausar' : `Tocar ${data.title}`}
        >
          {playingThisCollection ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
        </button>
        <span className="collection-count">
          {plural(data.trackIds.length, 'música', 'músicas')}
        </span>
      </div>

      {tracks.length === 0 ? (
        <div className="empty">
          <h3>Nenhuma música aqui ainda</h3>
          <p>
            Toque no coração de qualquer faixa para guardá-la em{' '}
            <button
              type="button"
              className="inline-link"
              onClick={() => navigate({ type: 'liked' })}
            >
              Músicas Curtidas
            </button>
            .
          </p>
        </div>
      ) : (
        <div className={view.type === 'album' ? 'track-table no-album' : 'track-table'}>
          <div className="track-head">
            <span>#</span>
            <span>Título</span>
            <span className="track-head-album">Álbum</span>
            <span />
            <span className="track-head-clock">
              <ClockIcon size={16} />
            </span>
          </div>
          {tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index}
              showCover={view.type === 'playlist' || view.type === 'liked'}
              showAlbum={view.type !== 'album'}
              // Nas músicas curtidas o × tira a música da lista, tal como o coração.
              onRemove={data.liked ? () => toggleLike(track.id) : undefined}
              onPlay={() => {
                if (current?.id === track.id) toggle()
                else playQueue(data.trackIds, track.id)
              }}
            />
          ))}
        </div>
      )}

      {data.genre && (
        <Section title={`Mais em ${data.genre}`}>
          <div className="card-grid">
            {genreAlbums(data.genre).map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                onOpen={() => navigate({ type: 'album', id: album.id })}
              />
            ))}
          </div>
        </Section>
      )}

      <p className="page-footer">
        goldenstream · demonstração com faixas livres do SoundHelix. Sem anúncios, porque não há contas.
      </p>
    </div>
  )
}
