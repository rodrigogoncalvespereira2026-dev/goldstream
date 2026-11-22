import type { Navigate, View } from '../lib/nav'
import { cx } from '../lib/format'

type MobileNavIconName = 'home' | 'search' | 'library' | 'liked' | 'settings'

function MobileNavIcon({ name, active }: { name: MobileNavIconName; active: boolean }) {
  return (
    <span className={cx('mobile-nav-icon', active && 'is-active')}>
      <svg
        className="mobile-nav-glyph"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {name === 'home' && (
          <>
            <path
              d="m3.3 10.7 7.8-6.5a1.4 1.4 0 0 1 1.8 0l7.8 6.5v8.1a1.7 1.7 0 0 1-1.7 1.7h-4.2v-5.8H9.2v5.8H5a1.7 1.7 0 0 1-1.7-1.7z"
              fill={active ? 'currentColor' : 'none'}
            />
            <path d="M10 20.5v-5.8h4.5v5.8" stroke={active ? '#101010' : 'currentColor'} />
          </>
        )}
        {name === 'search' && (
          <>
            <circle cx="10.8" cy="10.8" r="6.6" />
            <path d="m16 16 4.4 4.4" />
          </>
        )}
        {name === 'library' && (
          <>
            <rect x="3.5" y="5" width="4.4" height="14" rx="1" />
            <rect x="9.8" y="3.8" width="4.4" height="15.2" rx="1" />
            <path d="m16.1 5 3.1-.8 2.2 13.6-3.1.8z" />
          </>
        )}
        {name === 'liked' && (
          <path
            d="M20.5 8.8c0 4.6-8.5 10.1-8.5 10.1S3.5 13.4 3.5 8.8a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4Z"
            fill={active ? 'currentColor' : 'none'}
          />
        )}
        {name === 'settings' && (
          <>
            <path
              d="M9.8 3.2h4.4l.6 2a7.4 7.4 0 0 1 1.6.9l2-.7 2.2 3.8-1.5 1.5a7.6 7.6 0 0 1 0 1.8l1.5 1.5-2.2 3.8-2-.7a7.4 7.4 0 0 1-1.6.9l-.6 2H9.8l-.6-2a7.4 7.4 0 0 1-1.6-.9l-2 .7-2.2-3.8 1.5-1.5a7.6 7.6 0 0 1 0-1.8L3.4 9.2l2.2-3.8 2 .7a7.4 7.4 0 0 1 1.6-.9z"
              fill={active ? 'currentColor' : 'none'}
            />
            <circle
              cx="12"
              cy="11.5"
              r="3.1"
              fill={active ? 'var(--panel)' : 'none'}
              stroke={active ? 'var(--panel)' : 'currentColor'}
            />
          </>
        )}
      </svg>
    </span>
  )
}

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
        aria-current={view.type === 'home' ? 'page' : undefined}
      >
        <MobileNavIcon name="home" active={view.type === 'home'} />
        <span>Início</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'search' && 'is-active')}
        onClick={() => navigate({ type: 'search' })}
        aria-label="Buscar"
        aria-current={view.type === 'search' ? 'page' : undefined}
      >
        <MobileNavIcon name="search" active={view.type === 'search'} />
        <span>Buscar</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'library' && 'is-active')}
        onClick={() => navigate({ type: 'library' })}
        aria-label="Sua biblioteca"
        aria-current={view.type === 'library' ? 'page' : undefined}
      >
        <MobileNavIcon name="library" active={view.type === 'library'} />
        <span>Biblioteca</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'liked' && 'is-active')}
        onClick={() => navigate({ type: 'liked' })}
        aria-label="Músicas curtidas"
        aria-current={view.type === 'liked' ? 'page' : undefined}
      >
        <MobileNavIcon name="liked" active={view.type === 'liked'} />
        <span>Curtidas</span>
      </button>
      <button
        type="button"
        className={cx(view.type === 'settings' && 'is-active')}
        onClick={() => navigate({ type: 'settings' })}
        aria-label="Definições"
        aria-current={view.type === 'settings' ? 'page' : undefined}
      >
        <MobileNavIcon name="settings" active={view.type === 'settings'} />
        <span>Definições</span>
      </button>
    </nav>
  )
}
