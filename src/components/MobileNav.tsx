import type { Navigate, View } from '../lib/nav'
import { cx } from '../lib/format'
import { HeartIcon, HomeIcon, LibraryIcon, SearchIcon, SettingsIcon } from './Icons'

type MobileNavProps = {
  view: View
  navigate: Navigate
}

/** Barra de navegação inferior do telemóvel. */
export function MobileNav({ view, navigate }: MobileNavProps) {
  return (
    <nav className="mobile-nav" aria-label="Navegação">
      <button
        type="button"
        className={cx(view.type === 'home' && 'is-active')}
        onClick={() => navigate({ type: 'home' })}
        aria-label="Início"
      >
        <HomeIcon size={22} />
        <span>Início</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'search' && 'is-active')}
        onClick={() => navigate({ type: 'search' })}
        aria-label="Buscar"
      >
        <SearchIcon size={22} />
        <span>Buscar</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'library' && 'is-active')}
        onClick={() => navigate({ type: 'library' })}
        aria-label="Sua biblioteca"
      >
        <LibraryIcon size={22} />
        <span>Biblioteca</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'liked' && 'is-active')}
        onClick={() => navigate({ type: 'liked' })}
        aria-label="Músicas curtidas"
      >
        <HeartIcon size={22} />
        <span>Curtidas</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'settings' && 'is-active')}
        onClick={() => navigate({ type: 'settings' })}
        aria-label="Definições"
      >
        <SettingsIcon size={22} />
        <span>Definições</span>
      </button>
    </nav>
  )
}
