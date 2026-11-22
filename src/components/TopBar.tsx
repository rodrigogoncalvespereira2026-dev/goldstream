import { ArrowLeftIcon, ArrowRightIcon, RefreshIcon, SearchIcon } from './Icons'
import type { Navigate } from '../lib/nav'
import { cx } from '../lib/format'
import { reloadApp } from '../lib/update'
import { initialOf, useProfile } from '../lib/profile'

type TopBarProps = {
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
  navigate,
  query,
  onQuery,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  scrolled,
}: TopBarProps) {
  const [profile] = useProfile()

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

      <button
        type="button"
        className="topbar-refresh"
        onClick={reloadApp}
        aria-label="Atualizar app"
        title="Atualizar app"
      >
        <RefreshIcon size={20} />
      </button>

      <div className="topbar-right">
        <button
          type="button"
          className="user-chip"
          onClick={() => navigate({ type: 'profile' })}
          aria-label="Abrir perfil"
          title="Perfil"
        >
          <span className="avatar">{initialOf(profile.name)}</span>
          <span className="user-name">{profile.name}</span>
        </button>
      </div>
    </div>
  )
}
