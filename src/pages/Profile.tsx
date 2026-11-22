import { useState } from 'react'
import { getTrack } from '../lib/catalog'
import { plural } from '../lib/format'
import { initialOf, useProfile } from '../lib/profile'
import { usePlayer } from '../lib/player'
import { Section } from '../components/Cards'
import { CoverImage } from '../components/CoverImage'
import { CheckIcon, ClockIcon, HeartIcon, LibraryIcon, SettingsIcon, UserIcon } from '../components/Icons'
import type { Navigate } from '../lib/nav'

export function Profile({ navigate }: { navigate: Navigate }) {
  const { liked, recent, playQueue } = usePlayer()
  const [profile, setProfile] = useProfile()
  const [name, setName] = useState(profile.name)
  const [saved, setSaved] = useState(false)

  const recentTracks = recent
    .map((id) => getTrack(id))
    .filter((track): track is NonNullable<typeof track> => Boolean(track))
  const artists = new Set(recentTracks.map((track) => track.artist))

  const save = () => {
    const clean = name.trim() || profile.name
    setProfile({ name: clean })
    setName(clean)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="profile">
      <header className="profile-head">
        <span className="profile-avatar" aria-hidden="true">
          {initialOf(profile.name)}
        </span>
        <div>
          <p className="profile-kicker">Perfil</p>
          <h1 className="profile-name">{profile.name}</h1>
          <p className="profile-sub">
            {plural(liked.length, 'música curtida', 'músicas curtidas')} ·{' '}
            {plural(artists.size, 'artista', 'artistas')} no histórico
          </p>
        </div>
      </header>

      <Section title="O teu nome" note="Aparece no perfil e no avatar">
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Como queres ser chamado"
            aria-label="Nome do perfil"
            maxLength={40}
          />
          <button type="submit" className="connect-button">
            {saved ? (
              <>
                <CheckIcon size={16} />
                Guardado
              </>
            ) : (
              'Guardar'
            )}
          </button>
        </form>
      </Section>

      <Section title="Estatísticas de audição">
        <div className="stat-grid">
          <div className="stat-card">
            <strong>{liked.length}</strong>
            <span>músicas curtidas</span>
          </div>
          <div className="stat-card">
            <strong>{recentTracks.length}</strong>
            <span>no histórico</span>
          </div>
          <div className="stat-card">
            <strong>{artists.size}</strong>
            <span>artistas ouvidos</span>
          </div>
        </div>
      </Section>

      <Section title="Atalhos">
        <div className="profile-links">
          <button type="button" className="profile-link" onClick={() => navigate({ type: 'liked' })}>
            <HeartIcon size={20} filled />
            <span>
              <strong>Músicas curtidas</strong>
              <small>{plural(liked.length, 'música', 'músicas')}</small>
            </span>
          </button>
          <button
            type="button"
            className="profile-link"
            onClick={() => navigate({ type: 'library' })}
          >
            <LibraryIcon size={20} />
            <span>
              <strong>A tua biblioteca</strong>
              <small>Playlists, álbuns e artistas</small>
            </span>
          </button>
          <button
            type="button"
            className="profile-link"
            onClick={() => navigate({ type: 'settings' })}
          >
            <SettingsIcon size={20} />
            <span>
              <strong>Definições e privacidade</strong>
              <small>Atualizações, áudio e diagnóstico</small>
            </span>
          </button>
        </div>
      </Section>

      {recentTracks.length > 0 && (
        <Section title="Recentes" note="Voltar a ouvir">
          <div className="shelf">
            {recentTracks.map((track) => (
              <button
                key={track.id}
                type="button"
                className="shelf-card"
                onClick={() =>
                  playQueue(
                    recentTracks.map((item) => item.id),
                    track.id,
                  )
                }
              >
                <CoverImage className="shelf-art" src={track.cover} />
                <span className="shelf-title">{track.title}</span>
                <span className="shelf-sub">{track.artist}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {recentTracks.length === 0 && (
        <p className="profile-empty">
          <ClockIcon size={16} />
          Ainda não há histórico. Toca uma música para começar o teu perfil.
        </p>
      )}

      <p className="page-footer">
        <UserIcon size={14} /> Perfil guardado só neste dispositivo.
      </p>
    </div>
  )
}
