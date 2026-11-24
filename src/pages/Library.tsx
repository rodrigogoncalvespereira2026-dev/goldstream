import { useState } from 'react'
import { ALBUMS, PLAYLISTS } from '../lib/catalog'
import { HeartIcon, MusicNoteIcon, PlayIcon, PlusIcon, TrashIcon } from '../components/Icons'
import { createPlaylist, deletePlaylist, useUserPlaylists } from '../lib/userPlaylists'
import { cx, plural } from '../lib/format'
import { usePlayer } from '../lib/player'
import type { Navigate } from '../lib/nav'

type Filter = 'all' | 'playlists' | 'albums'

export function Library({ navigate }: { navigate: Navigate }) {
  const { liked, playQueue } = usePlayer()
  const mine = useUserPlaylists()
  const [filter, setFilter] = useState<Filter>('all')
  const [newName, setNewName] = useState('')
  /** Playlist a pedir confirmação para apagar (a confirmação é nossa, o
   *  window.confirm não abre no WebView do APK). */
  const [deleting, setDeleting] = useState<string | null>(null)

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
          <form
            className="library-create"
            onSubmit={(event) => {
              event.preventDefault()
              if (!newName.trim()) return
              const created = createPlaylist(newName)
              setNewName('')
              navigate({ type: 'mine', id: created.id })
            }}
          >
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nome da nova playlist"
              aria-label="Nome da nova playlist"
              maxLength={40}
            />
            <button type="submit" className="ghost-button">
              <PlusIcon size={15} /> Criar playlist
            </button>
          </form>

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

            {mine.map((playlist) => (
              <div
                key={playlist.id}
                className="library-row"
                role="button"
                tabIndex={0}
                onClick={() => navigate({ type: 'mine', id: playlist.id })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate({ type: 'mine', id: playlist.id })
                }}
              >
                <span className="library-row-thumb mine-thumb-lg">
                  <MusicNoteIcon size={20} />
                </span>
                <span className="library-row-text">
                  <span className="library-row-title">{playlist.name}</span>
                  <span className="library-row-meta">
                    A tua playlist · {plural(playlist.trackIds.length, 'música', 'músicas')}
                  </span>
                </span>
                {deleting === playlist.id ? (
                  <span className="library-row-confirm">
                    <button
                      type="button"
                      className="danger-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        deletePlaylist(playlist.id)
                        setDeleting(null)
                      }}
                    >
                      Apagar
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeleting(null)
                      }}
                    >
                      Não
                    </button>
                  </span>
                ) : (
                  <span className="library-row-actions">
                    <button
                      type="button"
                      className="library-row-play"
                      aria-label={`Tocar ${playlist.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (playlist.trackIds.length) {
                          playQueue(playlist.trackIds, playlist.trackIds[0])
                        }
                      }}
                    >
                      <PlayIcon size={20} />
                    </button>
                    <button
                      type="button"
                      className="library-row-trash"
                      aria-label={`Apagar a playlist ${playlist.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeleting(playlist.id)
                      }}
                    >
                      <TrashIcon size={18} />
                    </button>
                  </span>
                )}
              </div>
            ))}

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
