import { useState } from 'react'
import { ALBUMS, PLAYLISTS } from '../lib/catalog'
import { HeartIcon, PlayIcon } from '../components/Icons'
import { cx, plural } from '../lib/format'
import { usePlayer } from '../lib/player'
import type { Navigate } from '../lib/nav'

type Filter = 'all' | 'playlists' | 'albums'

export function Library({ navigate }: { navigate: Navigate }) {
  const { liked, playQueue } = usePlayer()
  const [filter, setFilter] = useState<Filter>('all')

  const showPlaylists = filter !== 'albums'
  const showAlbums = filter !== 'playlists'

  return (
    <div>
      <h1 className="page-title">Sua biblioteca</h1>

      <div className="chips" role="group" aria-label="Filtrar biblioteca">
        {(
          [
            ['all', 'Tudo'],
            ['playlists', 'Playlists'],
            ['albums', 'Álbuns'],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cx('chip', filter === value && 'is-active')}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>

      {showPlaylists && (
        <section className="section">
          <div className="section-head">
            <h2>Playlists</h2>
          </div>
          <div className="library-rows">
            <div
              className="library-row"
              role="button"
              tabIndex={0}
              onClick={() => navigate({ type: 'liked' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigate({ type: 'liked' })
              }}
            >
              <span className="liked-thumb-lg">
                <HeartIcon size={22} filled />
              </span>
              <span className="library-row-text">
                <span className="library-row-title">Músicas Curtidas</span>
                <span className="library-row-meta">
                  Playlist · {plural(liked.length, 'música', 'músicas')}
                </span>
              </span>
              <button
                type="button"
                className="library-row-play"
                aria-label="Tocar músicas curtidas"
                onClick={(event) => {
                  event.stopPropagation()
                  if (liked.length) playQueue(liked, liked[0])
                }}
              >
                <PlayIcon size={20} />
              </button>
            </div>

            {PLAYLISTS.map((playlist) => (
              <div
                key={playlist.id}
                className="library-row"
                role="button"
                tabIndex={0}
                onClick={() => navigate({ type: 'playlist', id: playlist.id })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate({ type: 'playlist', id: playlist.id })
                }}
              >
                <img src={playlist.cover} alt="" loading="lazy" />
                <span className="library-row-text">
                  <span className="library-row-title">{playlist.name}</span>
                  <span className="library-row-meta">
                    Playlist · {playlist.owner} ·{' '}
                    {plural(playlist.trackIds.length, 'música', 'músicas')}
                  </span>
                </span>
                <button
                  type="button"
                  className="library-row-play"
                  aria-label={`Tocar ${playlist.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    playQueue(playlist.trackIds, playlist.trackIds[0])
                  }}
                >
                  <PlayIcon size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {showAlbums && (
        <section className="section">
          <div className="section-head">
            <h2>Álbuns</h2>
          </div>
          <div className="library-rows">
            {ALBUMS.map((album) => (
              <div
                key={album.id}
                className="library-row"
                role="button"
                tabIndex={0}
                onClick={() => navigate({ type: 'album', id: album.id })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate({ type: 'album', id: album.id })
                }}
              >
                <img src={album.cover} alt="" loading="lazy" />
                <span className="library-row-text">
                  <span className="library-row-title">{album.title}</span>
                  <span className="library-row-meta">
                    Álbum · {album.artist} · {album.year}
                  </span>
                </span>
                <button
                  type="button"
                  className="library-row-play"
                  aria-label={`Tocar ${album.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    playQueue(album.trackIds, album.trackIds[0])
                  }}
                >
                  <PlayIcon size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
