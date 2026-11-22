import { useRef, useState } from 'react'
import { getTrack } from '../lib/catalog'
import { plural } from '../lib/format'
import { photoFromFile, useProfile } from '../lib/profile'
import { formatListening, useStats } from '../lib/stats'
import { usePlayer } from '../lib/player'
import { Avatar } from '../components/Avatar'
import { Section } from '../components/Cards'
import { CoverImage } from '../components/CoverImage'
import {
  CheckIcon,
  ClockIcon,
  HeartIcon,
  LibraryIcon,
  SettingsIcon,
  UserIcon,
} from '../components/Icons'
import type { Navigate } from '../lib/nav'

export function Profile({ navigate }: { navigate: Navigate }) {
  const { liked, recent, playQueue } = usePlayer()
  const [profile, setProfile] = useProfile()
  const stats = useStats()
  const [name, setName] = useState(profile.name)
  const [saved, setSaved] = useState(false)
  const [photoNote, setPhotoNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const recentTracks = recent
    .map((id) => getTrack(id))
    .filter((track): track is NonNullable<typeof track> => Boolean(track))
  const artists = new Set(recentTracks.map((track) => track.artist))

  const topTracks = Object.entries(stats.tracks)
    .filter(([, value]) => value.plays > 0 || value.seconds >= 20)
    .sort((a, b) => b[1].plays - a[1].plays || b[1].seconds - a[1].seconds)
    .slice(0, 5)
    .flatMap(([id, value]) => {
      const track = getTrack(id)
      return track ? [{ track, stats: value }] : []
    })

  const save = () => {
    const clean = name.trim() || profile.name
    setProfile({ ...profile, name: clean })
    setName(clean)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setPhotoNote('A preparar a foto…')
    try {
      const photo = await photoFromFile(file)
      setProfile({ ...profile, photo })
      setPhotoNote('Foto atualizada. Já aparece no avatar em cima.')
    } catch {
      setPhotoNote('Não consegui usar essa imagem. Tenta outra.')
    }
  }

  const removePhoto = () => {
    setProfile({ name: profile.name })
    setPhotoNote('Foto removida.')
  }

  return (
    <div className="profile">
      <header className="profile-head">
        <Avatar name={profile.name} photo={profile.photo} className="profile-avatar" />
        <div>
          <p className="profile-kicker">Perfil</p>
          <h1 className="profile-name">{profile.name}</h1>
          <p className="profile-sub">
            {plural(stats.plays, 'reprodução', 'reproduções')} ·{' '}
            {formatListening(stats.seconds)} ouvidos
          </p>
        </div>
      </header>

      <Section title="Foto de perfil" note="Escolhe uma imagem do telemóvel">
        <div className="profile-photo">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="profile-file"
            onChange={(event) => {
              void pickPhoto(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className="connect-button"
            onClick={() => fileRef.current?.click()}
          >
            <UserIcon size={18} />
            Escolher foto
          </button>
          {profile.photo && (
            <button type="button" className="ghost-button" onClick={removePhoto}>
              Remover foto
            </button>
          )}
        </div>
        {photoNote && <p className="settings-note">{photoNote}</p>}
      </Section>

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

      <Section title="Estatísticas de audição" note="Contadas neste dispositivo">
        <div className="stat-grid">
          <div className="stat-card">
            <strong>{stats.plays}</strong>
            <span>{plural(stats.plays, 'reprodução', 'reproduções')}</span>
          </div>
          <div className="stat-card">
            <strong>{formatListening(stats.seconds)}</strong>
            <span>tempo ouvido</span>
          </div>
          <div className="stat-card">
            <strong>{liked.length}</strong>
            <span>músicas curtidas</span>
          </div>
          <div className="stat-card">
            <strong>{artists.size}</strong>
            <span>artistas ouvidos</span>
          </div>
        </div>
        <p className="profile-sub">
          Cada reprodução conta depois de 20 segundos da mesma música. Só soma o tempo com o som
          a tocar — em pausa ou com o vídeo aberto não conta.
        </p>
      </Section>

      {topTracks.length > 0 && (
        <Section title="Mais ouvidos" note="As tuas músicas de sempre">
          <ol className="top-list">
            {topTracks.map(({ track, stats: item }, index) => (
              <li key={track.id} className="top-row">
                <span className="top-rank">{index + 1}</span>
                <CoverImage className="top-art" src={track.cover} />
                <span className="top-text">
                  <strong>{track.title}</strong>
                  <span>{track.artist}</span>
                </span>
                <span className="top-meta">
                  {plural(item.plays, 'reprodução', 'reproduções')} ·{' '}
                  {formatListening(item.seconds)}
                </span>
                <button
                  type="button"
                  className="track-video"
                  onClick={() =>
                    playQueue(
                      topTracks.map((entry) => entry.track.id),
                      track.id,
                    )
                  }
                >
                  Tocar
                </button>
              </li>
            ))}
          </ol>
        </Section>
      )}

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

      {recentTracks.length > 0 ? (
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
      ) : (
        <p className="profile-empty">
          <ClockIcon size={16} />
          Ainda não há histórico. Toca uma música para começar o teu perfil.
        </p>
      )}

      <p className="page-footer">
        <UserIcon size={14} /> Perfil e estatísticas guardados só neste dispositivo.
      </p>
    </div>
  )
}
