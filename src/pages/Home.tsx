import { ALBUMS, PLAYLISTS, getAlbum, getTrack } from '../lib/catalog'
import { AlbumCard, PlaylistCard, Section } from '../components/Cards'
import { HeartIcon, PlayIcon } from '../components/Icons'
import { greeting } from '../lib/format'
import { usePlayer } from '../lib/player'
import type { Navigate } from '../lib/nav'

export function Home({ navigate }: { navigate: Navigate }) {
  const { recent, liked, playQueue } = usePlayer()

  const recentAlbums = []
  const seen = new Set<string>()
  for (const id of recent) {
    const track = getTrack(id)
    if (!track || seen.has(track.albumId)) continue
    seen.add(track.albumId)
    const album = getAlbum(track.albumId)
    if (album) recentAlbums.push(album)
    if (recentAlbums.length === 5) break
  }

  const highlights = recentAlbums.length ? recentAlbums : ALBUMS.slice(0, 5)

  const quickItems = [
    {
      key: 'liked',
      name: 'Músicas Curtidas',
      cover: null as string | null,
      open: () => navigate({ type: 'liked' }),
      play: () => {
        if (liked.length) playQueue(liked, liked[0])
      },
    },
    ...PLAYLISTS.slice(0, 5).map((playlist) => ({
      key: playlist.id,
      name: playlist.name,
      cover: playlist.cover as string | null,
      open: () => navigate({ type: 'playlist', id: playlist.id }),
      play: () => playQueue(playlist.trackIds, playlist.trackIds[0]),
    })),
  ]

  return (
    <div className="home">
      <h1 className="page-title">{greeting()}</h1>

      <div className="quick-grid">
        {quickItems.map((item) => (
          <div
            key={item.key}
            className="quick-tile"
            role="button"
            tabIndex={0}
            onClick={item.open}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                item.open()
              }
            }}
          >
            {item.cover ? (
              <img src={item.cover} alt="" loading="lazy" />
            ) : (
              <span className="quick-cover">
                <HeartIcon size={26} filled />
              </span>
            )}
            <span className="quick-tile-name">{item.name}</span>
            <button
              type="button"
              className="quick-play"
              aria-label={`Tocar ${item.name}`}
              onClick={(event) => {
                event.stopPropagation()
                item.play()
              }}
            >
              <PlayIcon size={16} />
            </button>
          </div>
        ))}
      </div>

      <Section title="Tocadas recentemente">
        <div className="card-grid">
          {highlights.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              onOpen={() => navigate({ type: 'album', id: album.id })}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Feito para você"
        action="Ver biblioteca"
        onAction={() => navigate({ type: 'library' })}
      >
        <div className="card-grid">
          {PLAYLISTS.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              onOpen={() => navigate({ type: 'playlist', id: playlist.id })}
            />
          ))}
        </div>
      </Section>

      <Section title="Álbuns em destaque">
        <div className="card-grid">
          {ALBUMS.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              onOpen={() => navigate({ type: 'album', id: album.id })}
            />
          ))}
        </div>
      </Section>

      <p className="page-footer">
        Sonora é uma demonstração de player de música. As faixas são gravações livres do
        SoundHelix, usadas aqui apenas como conteúdo de exemplo.
      </p>
    </div>
  )
}
