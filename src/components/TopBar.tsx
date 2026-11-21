import {
  ArrowLeftIcon,
  ArrowRightIcon,
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  SearchIcon,
} from './Icons'
import type { Navigate, View } from '../lib/nav'
import { cx } from '../lib/format'

type TopBarProps = {
  view: View
  navigate: Navigate
  query: string
  onQuery: (value: string) => void
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  scrolled: boolean
}

export function TopBar({
  view,
  navigate,
  query,
  onQuery,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  scrolled,
}: TopBarProps) {
  return (
    <div className={cx('topbar', scrolled && 'is-scrolled')}>
      <div className="nav-buttons">
        <button
          type="button"
          className="nav-round"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Voltar"
        >
          <ArrowLeftIcon size={20} />
        </button>
        <button
          type="button"
          className="nav-round"
          onClick={onForward}
          disabled={!canGoForward}
          aria-label="Avançar"
        >
          <ArrowRightIcon size={20} />
        </button>
      </div>

      <label className="search-field">
        <SearchIcon size={20} />
        <input
          type="search"
          value={query}
          placeholder="O que você quer ouvir?"
          aria-label="Buscar músicas, álbuns e artistas"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onQuery('')
          }}
        />
      </label>

      <div className="topbar-right">
        <button type="button" className="user-chip" aria-label="Perfil do ouvinte">
          <span className="avatar">O</span>
          <span className="user-name">Ouvinte</span>
        </button>
      </div>

      <nav className="mobile-nav" aria-label="Navegação">
        <button
          type="button"
          className={cx(view.type === 'home' && 'is-active')}
          onClick={() => navigate({ type: 'home' })}
          aria-label="Início"
        >
          <HomeIcon size={22} />
        </button>
        <button
          type="button"
          className={cx(view.type === 'search' && 'is-active')}
          onClick={() => navigate({ type: 'search' })}
          aria-label="Buscar"
        >
          <SearchIcon size={22} />
        </button>
        <button
          type="button"
          className={cx(view.type === 'library' && 'is-active')}
          onClick={() => navigate({ type: 'library' })}
          aria-label="Sua biblioteca"
        >
          <LibraryIcon size={22} />
        </button>
        <button
          type="button"
          className={cx(view.type === 'liked' && 'is-active')}
          onClick={() => navigate({ type: 'liked' })}
          aria-label="Músicas curtidas"
        >
          <HeartIcon size={22} />
        </button>
      </nav>
    </div>
  )
}
