import { useEffect, useMemo, useState } from 'react'
import { ALBUMS, GENRES, searchCatalog, type Track } from '../lib/catalog'
import { searchFullSongs } from '../lib/audius'
import { searchYouTubeSongs, YOUTUBE_API_KEY } from '../lib/youtube'
import { AlbumCard, MediaCard, Section, TrackRow } from '../components/Cards'
import { YouTubeLink } from '../components/YouTubeLink'
import { usePlayer } from '../lib/player'
import type { Navigate } from '../lib/nav'

type SearchState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  tracks: Track[]
  error?: string
}

const idle: SearchState = { status: 'idle', tracks: [] }

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'A busca falhou.'

function TrackResults({
  tracks,
  showCover = true,
  showAlbum = true,
}: {
  tracks: Track[]
  showCover?: boolean
  showAlbum?: boolean
}) {
  const { current, toggle, playQueue } = usePlayer()
  const queueIds = tracks.map((track) => track.id)

  return (
    <div className={showAlbum ? 'track-table' : 'track-table no-album'}>
      <div className="track-head">
        <span>#</span>
        <span>Título</span>
        <span className="track-head-album">Álbum</span>
        <span />
        <span className="track-head-clock">Duração</span>
      </div>
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          showCover={showCover}
          showAlbum={showAlbum}
          onPlay={() => {
            if (current?.id === track.id) toggle()
            else playQueue(queueIds, track.id)
          }}
        />
      ))}
    </div>
  )
}

export function Search({ query, navigate }: { query: string; navigate: Navigate }) {
  const { current, isPlaying, playQueue } = usePlayer()
  const youTubeKey = YOUTUBE_API_KEY
  const trimmed = query.trim()
  const local = useMemo(() => searchCatalog(query), [query])
  const [full, setFull] = useState<SearchState>(idle)
  const [youTube, setYouTube] = useState<SearchState>(idle)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (trimmed.length < 2) {
      setFull(idle)
      setYouTube(idle)
      return
    }

    const controller = new AbortController()
    setFull({ status: 'loading', tracks: [] })
    setYouTube({ status: 'loading', tracks: [] })

    const settle = (promise: Promise<Track[]>, set: (state: SearchState) => void) => {
      promise
        .then((tracks) => {
          if (!controller.signal.aborted) set({ status: 'ready', tracks })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          set({ status: 'error', tracks: [], error: errorMessage(error) })
        })
    }

    const timer = window.setTimeout(() => {
      settle(searchFullSongs(trimmed, controller.signal), setFull)
      settle(searchYouTubeSongs(trimmed, youTubeKey, controller.signal), setYouTube)
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, attempt])

  if (!trimmed) {
    return (
      <div>
        <h1 className="page-title">Buscar</h1>
        <YouTubeLink />
        <div className="genre-grid">
          {GENRES.map((genre) => (
            <button
              key={genre.name}
              type="button"
              className="genre-tile"
              style={{ background: `linear-gradient(135deg, ${genre.from}, ${genre.to})` }}
              onClick={() => navigate({ type: 'genre', name: genre.name })}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const youTubeIds = youTube.tracks.map((track) => track.id)

  return (
    <div>
      <h1 className="page-title">
        Resultados para <span className="query-echo">“{trimmed}”</span>
      </h1>

      <Section
        title="YouTube · músicas completas"
        note="Qualquer artista · faixas completas, sem limite de buscas"
        action={youTube.status === 'ready' && youTube.tracks.length > 0 ? 'Tocar tudo' : undefined}
        onAction={() => {
          if (youTubeIds.length) playQueue(youTubeIds, youTubeIds[0])
        }}
      >
        <YouTubeLink />

        {youTube.status === 'loading' && (
          <div className="search-status">
            <span className="spinner" aria-hidden="true" />
            Buscando no YouTube…
          </div>
        )}

        {youTube.status === 'error' && (
          <div className="search-error">
            <span>{youTube.error}</span>
            <button type="button" className="retry-button" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        )}

        {youTube.status === 'ready' && youTube.tracks.length === 0 && (
          <div className="search-status">
            Nenhuma música tocável para “{trimmed}”. Tente incluir “áudio” ou “lyrics” no termo, ou
            cole o link direto da música.
          </div>
        )}

        {youTube.status === 'ready' && youTube.tracks.length > 0 && (
          <TrackResults tracks={youTube.tracks} />
        )}
      </Section>

      <Section
        title="Faixas completas do catálogo livre"
        note="Artistas independentes · arquivos de áudio inteiros"
        action={full.status === 'ready' && full.tracks.length > 0 ? 'Tocar tudo' : undefined}
        onAction={() => {
          const ids = full.tracks.map((track) => track.id)
          if (ids.length) playQueue(ids, ids[0])
        }}
      >
        {full.status === 'loading' && (
          <div className="search-status">
            <span className="spinner" aria-hidden="true" />
            Buscando faixas completas…
          </div>
        )}

        {full.status === 'error' && (
          <div className="search-error">
            <span>
              Não foi possível buscar as faixas completas. <em>{full.error}</em>
            </span>
            <button type="button" className="retry-button" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        )}

        {full.status === 'ready' && full.tracks.length === 0 && (
          <div className="search-status">
            Nenhuma faixa completa para “{trimmed}” no catálogo livre de artistas independentes.
          </div>
        )}

        {full.status === 'ready' && full.tracks.length > 0 && <TrackResults tracks={full.tracks} />}
      </Section>

      {(local.tracks.length > 0 || local.albums.length > 0 || local.artists.length > 0) && (
        <Section title="Na sua biblioteca" note="Catálogo de demonstração">
          {local.tracks.length > 0 && <TrackResults tracks={local.tracks} showAlbum={false} />}

          {local.albums.length > 0 && (
            <div className="card-grid local-grid">
              {local.albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onOpen={() => navigate({ type: 'album', id: album.id })}
                />
              ))}
            </div>
          )}

          {local.artists.length > 0 && (
            <div className="card-grid local-grid">
              {local.artists.map((artist) => {
                const album = ALBUMS.find((item) => item.artist === artist)
                if (!album) return null
                const artistTracks = ALBUMS.filter((item) => item.artist === artist).flatMap(
                  (item) => item.trackIds,
                )
                const playing = Boolean(current && artistTracks.includes(current.id) && isPlaying)
                return (
                  <MediaCard
                    key={artist}
                    title={artist}
                    subtitle="Artista"
                    cover={album.cover}
                    round
                    isCurrent={Boolean(current && artistTracks.includes(current.id))}
                    isPlaying={playing}
                    onOpen={() => navigate({ type: 'album', id: album.id })}
                    onPlay={() => playQueue(artistTracks, artistTracks[0])}
                  />
                )
              })}
            </div>
          )}
        </Section>
      )}

      <Section title="Categorias">
        <div className="genre-grid">
          {GENRES.slice(0, 4).map((genre) => (
            <button
              key={genre.name}
              type="button"
              className="genre-tile"
              style={{ background: `linear-gradient(135deg, ${genre.from}, ${genre.to})` }}
              onClick={() => navigate({ type: 'genre', name: genre.name })}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}
