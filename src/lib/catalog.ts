export const AUDIO_BASE = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-'

const audio = (n: number) => `${AUDIO_BASE}${n}.mp3`

export type Track = {
  id: string
  title: string
  artist: string
  albumId: string
  albumTitle: string
  cover: string
  src: string
  genre: string
  year: number
  position: number
  /** Faixa vinda de catálogo externo (Audius, Apple ou YouTube) */
  external?: boolean
  /** Mecanismo de reprodução: arquivo de áudio (padrão) ou player do YouTube */
  provider?: 'youtube'
  /** id do vídeo quando provider === 'youtube' */
  videoId?: string
  /** Duração conhecida da faixa externa, em segundos */
  duration?: number
}

export type Album = {
  id: string
  title: string
  artist: string
  year: number
  genre: string
  cover: string
  tint: string
  description: string
  trackIds: string[]
}

export type Playlist = {
  id: string
  name: string
  description: string
  cover: string
  tint: string
  trackIds: string[]
  owner: string
}

type RawAlbum = {
  id: string
  title: string
  artist: string
  year: number
  genre: string
  cover: string
  tint: string
  description: string
  tracks: { title: string; src: string }[]
}

const rawAlbums: RawAlbum[] = [
  {
    id: 'neon-tide',
    title: 'Neon Tide',
    artist: 'Aurora Nova',
    year: 2024,
    genre: 'Synthwave',
    cover: '/covers/neon-tide.jpg',
    tint: '#5b1c86',
    description: 'Sintetizadores largos e um horizonte que nunca chega.',
    tracks: [
      { title: 'Neon Tide', src: audio(1) },
      { title: 'Midnight Drive', src: audio(2) },
      { title: 'Coastline Static', src: audio(3) },
    ],
  },
  {
    id: 'golden-hour',
    title: 'Golden Hour',
    artist: 'Mia Larsen',
    year: 2023,
    genre: 'Indie Folk',
    cover: '/covers/golden-hour.jpg',
    tint: '#a4622a',
    description: 'Violão, poeira de estrada e o fim de uma tarde de verão.',
    tracks: [
      { title: 'Golden Hour', src: audio(4) },
      { title: 'Paper Boats', src: audio(5) },
      { title: 'Kitchen Window', src: audio(6) },
    ],
  },
  {
    id: 'low-orbit',
    title: 'Low Orbit',
    artist: 'Halcyon Drift',
    year: 2025,
    genre: 'Ambient',
    cover: '/covers/low-orbit.jpg',
    tint: '#182a5e',
    description: 'Texturas lentas para longas horas de foco.',
    tracks: [
      { title: 'Low Orbit', src: audio(7) },
      { title: 'Weightless', src: audio(8) },
      { title: 'Signal Fade', src: audio(9) },
    ],
  },
  {
    id: 'cinder-smoke',
    title: 'Cinder & Smoke',
    artist: 'The Paper Wolves',
    year: 2022,
    genre: 'Rock',
    cover: '/covers/cinder-smoke.jpg',
    tint: '#7d3413',
    description: 'Guitarras sujas, bateria na frente e nenhum arrependimento.',
    tracks: [
      { title: 'Cinder & Smoke', src: audio(10) },
      { title: 'Hollow Bones', src: audio(11) },
      { title: 'Northbound', src: audio(12) },
    ],
  },
  {
    id: 'velvet-static',
    title: 'Velvet Static',
    artist: 'Sable',
    year: 2024,
    genre: 'R&B',
    cover: '/covers/velvet-static.jpg',
    tint: '#43176b',
    description: 'Voz baixa, grave alto, luz de quarto às três da manhã.',
    tracks: [
      { title: 'Velvet Static', src: audio(13) },
      { title: 'Aftertaste', src: audio(14) },
    ],
  },
  {
    id: 'chrome-bloom',
    title: 'Chrome Bloom',
    artist: 'Kito & Rae',
    year: 2025,
    genre: 'House',
    cover: '/covers/chrome-bloom.jpg',
    tint: '#125a55',
    description: 'House melódica com metal líquido nas bordas.',
    tracks: [
      { title: 'Chrome Bloom', src: audio(15) },
      { title: 'Nightshift', src: audio(16) },
    ],
  },
]

export const ALBUMS: Album[] = rawAlbums.map((album) => ({
  id: album.id,
  title: album.title,
  artist: album.artist,
  year: album.year,
  genre: album.genre,
  cover: album.cover,
  tint: album.tint,
  description: album.description,
  trackIds: album.tracks.map((_, i) => `${album.id}:${i}`),
}))

export const TRACKS: Track[] = rawAlbums.flatMap((album) =>
  album.tracks.map((track, i) => ({
    id: `${album.id}:${i}`,
    title: track.title,
    artist: album.artist,
    albumId: album.id,
    albumTitle: album.title,
    cover: album.cover,
    src: track.src,
    genre: album.genre,
    year: album.year,
    position: i + 1,
  })),
)

const trackIndex = new Map(TRACKS.map((track) => [track.id, track]))
const albumIndex = new Map(ALBUMS.map((album) => [album.id, album]))

export const getTrack = (id: string | undefined): Track | undefined =>
  id ? trackIndex.get(id) : undefined

export const getAlbum = (id: string | undefined): Album | undefined =>
  id ? albumIndex.get(id) : undefined

export const getTracks = (ids: string[]): Track[] =>
  ids.map((id) => trackIndex.get(id)).filter((t): t is Track => Boolean(t))

/** Registra faixas externas (resultados da busca global) para poderem tocar e ser curtidas. */
export const registerTracks = (tracks: Track[]): void => {
  for (const track of tracks) {
    const playable = track?.provider === 'youtube' ? Boolean(track.videoId) : Boolean(track?.src)
    if (track?.id && playable && track.title) trackIndex.set(track.id, track)
  }
}

export const PLAYLISTS: Playlist[] = [
  {
    id: 'late-night',
    name: 'Late Night Drive',
    description: 'Faróis, asfalto vazio e sintetizadores.',
    cover: '/covers/neon-tide.jpg',
    tint: '#4b1780',
    owner: 'goldenstream',
    trackIds: [
      'neon-tide:0',
      'chrome-bloom:1',
      'velvet-static:0',
      'neon-tide:1',
      'chrome-bloom:0',
      'velvet-static:1',
      'neon-tide:2',
    ],
  },
  {
    id: 'focus',
    name: 'Foco Total',
    description: 'Camadas ambientes para não pensar em mais nada.',
    cover: '/covers/low-orbit.jpg',
    tint: '#17265a',
    owner: 'goldenstream',
    trackIds: ['low-orbit:0', 'low-orbit:1', 'low-orbit:2', 'golden-hour:1'],
  },
  {
    id: 'feel-good',
    name: 'Boa Vibração',
    description: 'Sol na janela, café na mão, nada de pressa.',
    cover: '/covers/golden-hour.jpg',
    tint: '#9a5a24',
    owner: 'goldenstream',
    trackIds: [
      'golden-hour:0',
      'golden-hour:2',
      'chrome-bloom:0',
      'velvet-static:0',
      'golden-hour:1',
    ],
  },
  {
    id: 'garage',
    name: 'Garagem',
    description: 'Riff alto, volume no máximo, vizinho reclamando.',
    cover: '/covers/cinder-smoke.jpg',
    tint: '#74300f',
    owner: 'goldenstream',
    trackIds: ['cinder-smoke:0', 'cinder-smoke:2', 'neon-tide:2', 'cinder-smoke:1'],
  },
]

export const getPlaylist = (id: string | undefined): Playlist | undefined =>
  PLAYLISTS.find((playlist) => playlist.id === id)

export type GenreTile = {
  name: string
  from: string
  to: string
  /** Gêneros do catálogo que alimentam o tile quando o nome do tile não é um gênero de álbum. */
  sources?: string[]
}

export const GENRES: GenreTile[] = [
  { name: 'Synthwave', from: '#7b2ff7', to: '#3a0d6b' },
  { name: 'Indie Folk', from: '#d98d3f', to: '#7a3d14' },
  { name: 'Ambient', from: '#2b4bd8', to: '#111c4d' },
  { name: 'Rock', from: '#e2461f', to: '#5a1508' },
  { name: 'R&B', from: '#a83fd4', to: '#3d0f52' },
  { name: 'House', from: '#12c2a8', to: '#083f3a' },
  { name: 'Chill', from: '#4f8de0', to: '#14294c', sources: ['Ambient', 'R&B'] },
  { name: 'Foco', from: '#5c6bc0', to: '#1a1f3d', sources: ['Ambient'] },
  { name: 'Festa', from: '#e3358a', to: '#5c0f34', sources: ['House', 'R&B'] },
  { name: 'Acústico', from: '#c9a227', to: '#4a3a08', sources: ['Indie Folk'] },
]

export const searchCatalog = (query: string) => {
  const q = query.trim().toLowerCase()
  if (!q) return { tracks: [], albums: [], artists: [] as string[] }
  const matches = (value: string) => value.toLowerCase().includes(q)
  const tracks = TRACKS.filter(
    (t) => matches(t.title) || matches(t.artist) || matches(t.albumTitle) || matches(t.genre),
  )
  const albums = ALBUMS.filter(
    (a) => matches(a.title) || matches(a.artist) || matches(a.genre),
  )
  const artists = Array.from(new Set(ALBUMS.map((a) => a.artist))).filter(matches)
  return { tracks, albums, artists }
}

export const genreAlbums = (genre: string): Album[] => {
  const tile = GENRES.find((item) => item.name === genre)
  const sources = tile?.sources?.length ? tile.sources : [genre]
  return ALBUMS.filter((album) => sources.includes(album.genre))
}
