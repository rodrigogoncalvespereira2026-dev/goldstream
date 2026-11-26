import { useState } from 'react'
import { addToPlaylist, createPlaylist, toggleInPlaylist, useUserPlaylists } from '../lib/userPlaylists'
import { CheckIcon, PlusIcon } from './Icons'
import { cx } from '../lib/format'
import { fecharTeclado } from '../lib/teclado'

type PlaylistSheetProps = {
  trackId: string
  onClose: () => void
}

/** Escolhe (ou cria) uma playlist para a música. Usado nas linhas e no player. */
export function PlaylistSheet({ trackId, onClose }: PlaylistSheetProps) {
  const playlists = useUserPlaylists()
  const [name, setName] = useState('')

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar a uma playlist"
      onClick={onClose}
    >
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <h2>Adicionar a uma playlist</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <form
          className="sheet-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            fecharTeclado()
            const created = createPlaylist(name)
            addToPlaylist(created.id, trackId)
            setName('')
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nova playlist"
            aria-label="Nome da nova playlist"
            maxLength={40}
          />
          <button type="submit" className="connect-button">
            Criar
          </button>
        </form>

        {playlists.length > 0 ? (
          <ul className="sheet-list">
            {playlists.map((playlist) => {
              const has = playlist.trackIds.includes(trackId)
              return (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className={cx('sheet-item', has && 'is-added')}
                    onClick={() => toggleInPlaylist(playlist.id, trackId)}
                  >
                    <span className="sheet-item-name">{playlist.name}</span>
                    <span className="sheet-item-state">
                      {has ? (
                        <>
                          <CheckIcon size={15} /> Na playlist
                        </>
                      ) : (
                        <>
                          <PlusIcon size={15} /> Adicionar
                        </>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="sheet-empty">Ainda não tens playlists. Cria a primeira acima.</p>
        )}
      </div>
    </div>
  )
}
