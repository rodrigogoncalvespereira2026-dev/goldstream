import { PLAYLISTS } from '../lib/catalog'
import type { Navigate, View } from '../lib/nav'
import { usePlayer } from '../lib/player'
import { cx, plural } from '../lib/format'
import { HeartIcon, HomeIcon, LibraryIcon, LogoMark, SearchIcon, SettingsIcon } from './Icons'

type SidebarProps = {
  view: View
  navigate: Navigate
}

export function Sidebar({ view, navigate }: SidebarProps) {
  const { liked } = usePlayer()

  return (
    <aside className="sidebar">
      <div className="sidebar-panel nav-panel">
        <button type="button" className="brand" onClick={() => navigate({ type: 'home' })}>
          <LogoMark size={28} />
          <span>Sonora</span>
        </button>

        <nav className="nav-list" aria-label="Navegação principal">
          <button
            type="button"
            className={cx('nav-item', view.type === 'home' && 'is-active')}
            onClick={() => navigate({ type: 'home' })}
          >
            <HomeIcon size={25} />
            <span>Início</span>
          </button>
          <button
            type="button"
            className={cx('nav-item', view.type === 'search' && 'is-active')}
            onClick={() => navigate({ type: 'search' })}
          >
            <SearchIcon size={25} />
            <span>Buscar</span>
          </button>
          <button
            type="button"
            className={cx('nav-item', view.type === 'library' && 'is-active')}
            onClick={() => navigate({ type: 'library' })}
          >
            <LibraryIcon size={25} />
            <span>Sua biblioteca</span>
          </button>
          <button
            type="button"
            className={cx('nav-item', view.type === 'settings' && 'is-active')}
            onClick={() => navigate({ type: 'settings' })}
          >
            <SettingsIcon size={25} />
            <span>Definições</span>
          </button>
        </nav>
      </div>

      <div className="sidebar-panel library-panel">
        <div className="library-head">
          <span className="library-title">
            <LibraryIcon size={21} />
            Sua biblioteca
          </span>
        </div>

        <div className="sidebar-list">
          <button
            type="button"
            className={cx('sidebar-item', view.type === 'liked' && 'is-active')}
            onClick={() => navigate({ type: 'liked' })}
          >
            <span className="sidebar-thumb liked-thumb">
              <HeartIcon size={15} filled />
            </span>
            <span className="sidebar-item-text">
              <strong>Músicas Curtidas</strong>
              <span>Playlist · {plural(liked.length, 'música', 'músicas')}</span>
            </span>
          </button>

          {PLAYLISTS.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              className={cx(
                'sidebar-item',
                view.type === 'playlist' && view.id === playlist.id && 'is-active',
              )}
              onClick={() => navigate({ type: 'playlist', id: playlist.id })}
            >
              <img className="sidebar-thumb" src={playlist.cover} alt="" loading="lazy" />
              <span className="sidebar-item-text">
                <strong>{playlist.name}</strong>
                <span>
                  Playlist · {plural(playlist.trackIds.length, 'música', 'músicas')}
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="sidebar-foot">Demo com áudio livre · SoundHelix</p>
      </div>
    </aside>
  )
}
