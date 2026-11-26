import { useState } from 'react'
import { getTrack } from '../lib/catalog'
import { usePlayer } from '../lib/player'
import {
  deletePlaylist,
  renamePlaylist,
  removeFromPlaylist,
  useUserPlaylists,
} from '../lib/userPlaylists'
import { TrackRow } from '../components/Cards'
import { MusicNoteIcon, PlayIcon, TrashIcon } from '../components/Icons'
import { formatLongDuration, plural } from '../lib/format'
import { fecharTeclado } from '../lib/teclado'
import type { Navigate } from '../lib/nav'

export function MyPlaylist({ id, navigate }: { id: string; navigate: Navigate }) {
  const playlists = useUserPlaylists()
  const playlist = playlists.find((item) => item.id === id)
  const { playQueue, durations, current, toggle } = usePlayer()
  const [name, setName] = useState(playlist?.name ?? '')
  // A confirmação é feita aqui dentro: o window.confirm não abre no WebView do
  // APK (devolve sempre "não") e a playlist nunca chegava a ser apagada.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!playlist) {
    return (
      <div>
        <h1 className="page-title">Playlist</h1>
        <p className="page-sub">Esta playlist já não existe.</p>
        <button type="button" className="connect-button" onClick={() => navigate({ type: 'library' })}>
          Voltar à biblioteca
        </button>
      </div>
    )
  }

  const tracks = playlist.trackIds
    .map((trackId) => getTrack(trackId))
    .filter((track): track is NonNullable<ReturnType<typeof getTrack>> => Boolean(track))
  const total = playlist.trackIds.reduce((sum, trackId) => sum + (durations[trackId] ?? 0), 0)
  const cover = tracks[0]?.cover

  return (
    <div>
      <header className="mine-head">
        {cover ? (
          <img className="mine-cover" src={cover} alt="" />
        ) : (
          <span className="mine-cover mine-cover-empty">
            <MusicNoteIcon size={30} />
          </span>
        )}

        <div className="mine-text">
          <p className="profile-kicker">A tua playlist</p>
          <h1 className="mine-title">{playlist.name}</h1>
          <p className="profile-sub">
            {plural(tracks.length, 'música', 'músicas')}
            {total > 0 ? ` · ${formatLongDuration(total)}` : ''}
          </p>

          <div className="mine-actions">
            <button
              type="button"
              className="connect-button"
              onClick={() => {
                if (tracks.length) playQueue(playlist.trackIds, playlist.trackIds[0])
              }}
            >
              <PlayIcon size={16} />
              Tocar
            </button>

            <form
              className="mine-rename"
              onSubmit={(event) => {
                event.preventDefault()
                fecharTeclado()
                renamePlaylist(playlist.id, name)
              }}
            >
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Nome da playlist"
                maxLength={40}
              />
              <button type="submit" className="ghost-button">
                Mudar nome
              </button>
            </form>

            {confirmingDelete ? (
              <span className="confirm-delete" role="group" aria-label="Confirmar que apaga a playlist">
                <span className="confirm-delete-text">Apagar “{playlist.name}”?</span>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    deletePlaylist(playlist.id)
                    navigate({ type: 'library' })
                  }}
                >
                  Sim, apagar
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="ghost-button is-danger"
                onClick={() => setConfirmingDelete(true)}
              >
                <TrashIcon size={15} />
                Apagar
              </button>
            )}
          </div>
        </div>
      </header>

      {tracks.length === 0 ? (
        <p className="profile-empty">
          <MusicNoteIcon size={16} /> Ainda não tem músicas. Usa o ＋ numa música para a pôr aqui.
        </p>
      ) : (
        <div className="track-table no-album">
          <div className="track-head">
            <span>#</span>
            <span>Título</span>
            <span className="track-head-album" />
            <span />
            <span className="track-head-clock">Duração</span>
          </div>
          {tracks.map((track, index) => (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              showAlbum={false}
              onRemove={() => removeFromPlaylist(playlist.id, track.id)}
              onPlay={() => {
                if (current?.id === track.id) toggle()
                else playQueue(playlist.trackIds, track.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
