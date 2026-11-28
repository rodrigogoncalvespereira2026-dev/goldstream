import { useRef } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, MicIcon, SearchIcon } from './Icons'
import { useEscuta } from '../lib/voz'
import type { Navigate } from '../lib/nav'
import { cx } from '../lib/format'
import { useProfile } from '../lib/profile'
import { Avatar } from './Avatar'

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
  const campoBusca = useRef<HTMLInputElement>(null)
  // Falar o nome da música: o texto reconhecido entra na busca como se fosse escrito.
  const escuta = useEscuta(onQuery)

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
          ref={campoBusca}
          type="search"
          enterKeyHint="search"
          value={query}
          placeholder={escuta.aviso || 'O que você quer ouvir?'}
          aria-label="Buscar músicas, álbuns e artistas"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onQuery('')
            // Ao premir pesquisar/a vançar, os resultados já estão na tela:
            // tira o foco para o teclado do telemóvel fechar.
            if (event.key === 'Enter') {
              event.preventDefault()
              campoBusca.current?.blur()
            }
          }}
        />
        {escuta.disponivel && (
          <button
            type="button"
            className={cx('search-mic', escuta.aOuvir && 'is-ouvindo')}
            onClick={() => escuta.alternar()}
            // Sem tirar o foco do campo, o teclado não salta ao carregar no microfone.
            onMouseDown={(event) => event.preventDefault()}
            aria-label={escuta.aOuvir ? 'Parar de ouvir' : 'Falar o nome da música'}
            aria-pressed={escuta.aOuvir}
            title={escuta.aOuvir ? 'A ouvir…' : 'Falar o nome da música'}
          >
            <MicIcon size={18} />
          </button>
        )}
      </label>

      <button
        type="button"
        className="user-chip profile-chip"
        onClick={() => navigate({ type: 'profile' })}
        aria-label="Abrir perfil"
        title="Perfil"
      >
        <Avatar name={profile.name} photo={profile.photo} />
        <span className="user-name">{profile.name}</span>
      </button>
    </div>
  )
}
