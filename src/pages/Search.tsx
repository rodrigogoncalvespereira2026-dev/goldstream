import { useEffect, useMemo, useState } from 'react'
import { ALBUMS, GENRES, getTrack, searchCatalog, type Track } from '../lib/catalog'
import { searchFullSongs } from '../lib/audius'
import { rankByRelevance, searchYouTubeSongs, YOUTUBE_API_KEY } from '../lib/youtube'
import { AlbumCard, MediaCard, Section, TrackRow } from '../components/Cards'
import { usePlayer } from '../lib/player'
import { useSearchHistory } from '../lib/searchHistory'
import {
  parseTikTokLink,
  resolverTikTok,
  trackDoSom,
  useDescobertasTikTok,
  type AchadoTikTok,
} from '../lib/tiktok'
import type { Navigate } from '../lib/nav'
import { useTikTokAtivo } from '../lib/tiktokOpcao'

type SearchState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  tracks: Track[]
  error?: string
}

const idle: SearchState = { status: 'idle', tracks: [] }

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'A busca falhou.'

function TrackResults({
  tracks,
  showCover = true,
  showAlbum = true,
}: {
  tracks: Track[]
  showCover?: boolean
  showAlbum?: boolean
}) {
  const { current, toggle, playQueue } = usePlayer()
  const queueIds = tracks.map((track) => track.id)

  return (
    <div className={showAlbum ? 'track-table' : 'track-table no-album'}>
      <div className="track-head">
        <span>#</span>
        <span>Título</span>
        <span className="track-head-album">Álbum</span>
        <span />
        <span className="track-head-clock">Duração</span>
      </div>
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          showCover={showCover}
          showAlbum={showAlbum}
          onPlay={() => {
            if (current?.id === track.id) toggle()
            else playQueue(queueIds, track.id)
          }}
        />
      ))}
    </div>
  )
}

export function Search({ query, navigate }: { query: string; navigate: Navigate }) {
  const { current, isPlaying, playQueue, recent } = usePlayer()
  const [history, rememberSearch, clearHistory] = useSearchHistory()
  const [tiktokAtivo] = useTikTokAtivo()

  const suggestions = useMemo(() => {
    const artists: string[] = []
    recent.forEach((id) => {
      const track = getTrack(id)
      // Com a opção do TikTok desligada, o som do vídeo também sai das sugestões.
      if (!track || (!tiktokAtivo && track.albumId === 'tiktok')) return
      if (!artists.includes(track.artist)) artists.push(track.artist)
    })
    return artists.slice(0, 8)
  }, [recent, tiktokAtivo])
  const youTubeKey = YOUTUBE_API_KEY
  const trimmed = query.trim()
  const local = useMemo(() => searchCatalog(query), [query])
  const [full, setFull] = useState<SearchState>(idle)
  const [youTube, setYouTube] = useState<SearchState>(idle)
  const [attempt, setAttempt] = useState(0)

  // Um link do TikTok não é uma pesquisa: primeiro descobre-se que música é.
  const linkTikTok = useMemo(() => parseTikTokLink(query), [query])
  const [tiktok, setTiktok] = useState<{
    estado: 'idle' | 'a-procurar' | 'pronto' | 'erro'
    achado?: AchadoTikTok
    erro?: string
  }>({ estado: 'idle' })
  const [descobertas, guardarDescoberta] = useDescobertasTikTok()
  const [linkTikTokInput, setLinkTikTokInput] = useState('')

  useEffect(() => {
    if (!linkTikTok) {
      setTiktok({ estado: 'idle' })
      return
    }

    let vivo = true
    setTiktok({ estado: 'a-procurar' })
    resolverTikTok(linkTikTok)
      .then((achado) => {
        if (!vivo) return
        setTiktok({ estado: 'pronto', achado })
        guardarDescoberta({
          termo: achado.termo,
          musica: achado.musica ?? achado.termo,
          autor: achado.autor ?? '',
          capa: achado.capa ?? '',
        })
      })
      .catch((error: unknown) => {
        if (vivo) setTiktok({ estado: 'erro', erro: errorMessage(error) })
      })

    return () => {
      vivo = false
    }
  }, [linkTikTok, attempt])

  // Com um link do TikTok, procura-se o nome que o servidor tirou de lá.
  const busca = linkTikTok ? (tiktok.achado?.termo ?? '') : trimmed

  useEffect(() => {
    if (busca.length < 2) {
      setFull(idle)
      setYouTube(idle)
      return
    }

    const controller = new AbortController()
    setFull({ status: 'loading', tracks: [] })
    setYouTube({ status: 'loading', tracks: [] })

    const settle = (promise: Promise<Track[]>, set: (state: SearchState) => void) => {
      promise
        .then((tracks) => {
          if (!controller.signal.aborted) set({ status: 'ready', tracks })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          set({ status: 'error', tracks: [], error: errorMessage(error) })
        })
    }

    const timer = window.setTimeout(() => {
      rememberSearch(busca)
      settle(
        searchFullSongs(busca, controller.signal).then((tracks) => rankByRelevance(busca, tracks)),
        setFull,
      )
      settle(searchYouTubeSongs(busca, youTubeKey, controller.signal, 30), setYouTube)
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [busca, attempt])

  // O som do vídeo toca sempre: é a única forma de ouvir o que não tem nome.
  const somTikTok = useMemo(
    () => (linkTikTok && tiktok.achado ? trackDoSom(tiktok.achado, linkTikTok) : null),
    [linkTikTok, tiktok.achado],
  )

  if (!trimmed) {
    return (
      <div>
        <h1 className="page-title">Buscar</h1>

        {tiktokAtivo && (
          <Section
            title="Músicas do TikTok"
            note="Cola o link do vídeo e a app encontra a música completa"
          >
            <form
              className="tiktok-form"
              onSubmit={(event) => {
                event.preventDefault()
                const link = parseTikTokLink(linkTikTokInput) ?? linkTikTokInput.trim()
                if (!link) return
                navigate({ type: 'search', query: link })
              }}
            >
              <input
                className="tiktok-input"
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://www.tiktok.com/@…/video/…"
                aria-label="Link do TikTok"
                value={linkTikTokInput}
                onChange={(event) => setLinkTikTokInput(event.target.value)}
              />
              <button className="tiktok-button" type="submit" disabled={!linkTikTokInput.trim()}>
                Procurar
              </button>
            </form>

            {descobertas.length > 0 && (
              <div className="chips tiktok-recentes">
                {descobertas.map((item) => (
                  <button
                    key={`${item.termo}-${item.em}`}
                    type="button"
                    className="chip"
                    onClick={() => navigate({ type: 'search', query: item.termo })}
                  >
                    {item.musica}
                  </button>
                ))}
              </div>
            )}
          </Section>
        )}

        {history.length > 0 && (
          <Section title="Pesquisas recentes" action="Limpar" onAction={clearHistory}>
            <div className="chips">
              {history.map((term) => (
                <button
                  key={term}
                  type="button"
                  className="chip"
                  onClick={() => navigate({ type: 'search', query: term })}
                >
                  {term}
                </button>
              ))}
            </div>
          </Section>
        )}

        {suggestions.length > 0 && (
          <Section title="Sugestões" note="A partir do que ouviste">
            <div className="chips">
              {suggestions.map((artist) => (
                <button
                  key={artist}
                  type="button"
                  className="chip"
                  onClick={() => navigate({ type: 'search', query: artist })}
                >
                  {artist}
                </button>
              ))}
            </div>
          </Section>
        )}

        <div className="genre-grid">
          {GENRES.map((genre) => (
            <button
              key={genre.name}
              type="button"
              className="genre-tile"
              style={{ background: `linear-gradient(135deg, ${genre.from}, ${genre.to})` }}
              onClick={() => navigate({ type: 'genre', name: genre.name })}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const youTubeIds = youTube.tracks.map((track) => track.id)

  if (linkTikTok && tiktok.estado !== 'pronto') {
    return (
      <div>
        <h1 className="page-title">Do TikTok</h1>

        {tiktok.estado === 'erro' ? (
          <div className="search-error">
            <span>
              {tiktok.erro}{' '}
              <em>Podes escrever o nome da música na busca.</em>
            </span>
            <button type="button" className="retry-button" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="search-status">
            <span className="spinner" aria-hidden="true" />
            A ler o link do TikTok…
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">
        {linkTikTok ? (
          <>
            Do TikTok <span className="query-echo">“{busca || trimmed}”</span>
          </>
        ) : (
          <>
            Resultados para <span className="query-echo">“{trimmed}”</span>
          </>
        )}
      </h1>

      {somTikTok && tiktokAtivo && (
        <Section title="Som do TikTok" note="O áudio do próprio vídeo, como está no TikTok">
          <TrackResults tracks={[somTikTok]} showAlbum={false} />
        </Section>
      )}

      <Section
        title="YouTube · músicas completas"
        note="Qualquer artista · faixas completas, sem limite de buscas"
        action={youTube.status === 'ready' && youTube.tracks.length > 0 ? 'Tocar tudo' : undefined}
        onAction={() => {
          if (youTubeIds.length) playQueue(youTubeIds, youTubeIds[0])
        }}
      >
        {youTube.status === 'loading' && (
          <div className="search-status">
            <span className="spinner" aria-hidden="true" />
            Buscando no YouTube…
          </div>
        )}

        {youTube.status === 'error' && (
          <div className="search-error">
            <span>{youTube.error}</span>
            <button type="button" className="retry-button" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        )}

        {youTube.status === 'ready' && youTube.tracks.length === 0 && (
          <div className="search-status">
            Nenhuma música tocável para “{busca}”. Tente incluir “áudio” ou “lyrics” no termo, ou
            cole o link direto da música.
          </div>
        )}

        {youTube.status === 'ready' && youTube.tracks.length > 0 && (
          <TrackResults tracks={youTube.tracks} />
        )}
      </Section>

      <Section
        title="Faixas completas do catálogo livre"
        note="Artistas independentes · arquivos de áudio inteiros"
        action={full.status === 'ready' && full.tracks.length > 0 ? 'Tocar tudo' : undefined}
        onAction={() => {
          const ids = full.tracks.map((track) => track.id)
          if (ids.length) playQueue(ids, ids[0])
        }}
      >
        {full.status === 'loading' && (
          <div className="search-status">
            <span className="spinner" aria-hidden="true" />
            Buscando faixas completas…
          </div>
        )}

        {full.status === 'error' && (
          <div className="search-error">
            <span>
              Não foi possível buscar as faixas completas. <em>{full.error}</em>
            </span>
            <button type="button" className="retry-button" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </button>
          </div>
        )}

        {full.status === 'ready' && full.tracks.length === 0 && (
          <div className="search-status">
            Nenhuma faixa completa para “{busca || trimmed}” no catálogo livre de artistas
            independentes.
          </div>
        )}

        {full.status === 'ready' && full.tracks.length > 0 && <TrackResults tracks={full.tracks} />}
      </Section>

      {(local.tracks.length > 0 || local.albums.length > 0 || local.artists.length > 0) && (
        <Section title="No catálogo" note="Catálogo de demonstração">
          {local.tracks.length > 0 && <TrackResults tracks={local.tracks} showAlbum={false} />}

          {local.albums.length > 0 && (
            <div className="card-grid local-grid">
              {local.albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onOpen={() => navigate({ type: 'album', id: album.id })}
                />
              ))}
            </div>
          )}

          {local.artists.length > 0 && (
            <div className="card-grid local-grid">
              {local.artists.map((artist) => {
                const album = ALBUMS.find((item) => item.artist === artist)
                if (!album) return null
                const artistTracks = ALBUMS.filter((item) => item.artist === artist).flatMap(
                  (item) => item.trackIds,
                )
                const playing = Boolean(current && artistTracks.includes(current.id) && isPlaying)
                return (
                  <MediaCard
                    key={artist}
                    title={artist}
                    subtitle="Artista"
                    cover={album.cover}
                    round
                    isCurrent={Boolean(current && artistTracks.includes(current.id))}
                    isPlaying={playing}
                    onOpen={() => navigate({ type: 'album', id: album.id })}
                    onPlay={() => playQueue(artistTracks, artistTracks[0])}
                  />
                )
              })}
            </div>
          )}
        </Section>
      )}

      <Section title="Categorias">
        <div className="genre-grid">
          {GENRES.slice(0, 4).map((genre) => (
            <button
              key={genre.name}
              type="button"
              className="genre-tile"
              style={{ background: `linear-gradient(135deg, ${genre.from}, ${genre.to})` }}
              onClick={() => navigate({ type: 'genre', name: genre.name })}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}
