import { useState } from 'react'
import { usePlayer } from '../lib/player'
import { searchYouTubeSongs, trackFromYouTubeLink, YOUTUBE_API_KEY } from '../lib/youtube'
import { parseTikTokLink, resolverTikTok, trackDoSom, type AchadoTikTok } from '../lib/tiktok'
import { fecharTeclado } from '../lib/teclado'
import type { Track } from '../lib/catalog'

/** "sonido original", "som original"… não é nome de música nenhuma. */
const SOM_GENERICO = /^(sonido|som|original|audio|áudio|sound)\b/i

/**
 * Link do TikTok: se o som tiver nome, toca a música completa no YouTube; se não
 * tiver (é áudio do criador), toca o som do próprio vídeo.
 */
async function trackFromTikTokLink(link: string): Promise<Track> {
  let achado: AchadoTikTok = {
    termo: '',
    musica: null,
    autor: null,
    capa: null,
    legenda: null,
    link,
  }
  try {
    achado = await resolverTikTok(link)
  } catch {
    /* sem nome na página: o som do vídeo ainda pode tocar */
  }

  if (achado.termo && achado.musica && !SOM_GENERICO.test(achado.musica)) {
    try {
      const tracks = await searchYouTubeSongs(achado.termo, YOUTUBE_API_KEY, undefined, 10)
      if (tracks.length) return tracks[0]
    } catch {
      /* busca sem resposta: fica o som do vídeo */
    }
  }

  return trackDoSom(achado, link)
}

export function YouTubeLink() {
  const { playQueue } = usePlayer()
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')

  return (
    <form
      className="yt-link"
      onSubmit={async (event) => {
        event.preventDefault()
        const link = value.trim()
        if (!link || status === 'loading') return

        fecharTeclado()
        setStatus('loading')
        setMessage('')
        try {
          const tiktok = parseTikTokLink(link)
          const track = tiktok ? await trackFromTikTokLink(tiktok) : await trackFromYouTubeLink(link)
          if (!track) {
            setStatus('error')
            setMessage(
              'Não reconheci esse link. Cole algo como https://www.youtube.com/watch?v=… ou um link do TikTok.',
            )
            return
          }
          playQueue([track.id], track.id)
          setValue('')
          setStatus('idle')
        } catch {
          setStatus('error')
          setMessage('Não foi possível carregar esse link agora. Tente de novo.')
        }
      }}
    >
      <label className="yt-link-label" htmlFor="yt-link">
        Cole o link de uma música do YouTube ou de um vídeo do TikTok
      </label>
      <div className="yt-link-row">
        <input
          id="yt-link"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            if (status === 'error') setStatus('idle')
          }}
          placeholder="https://www.youtube.com/watch?v=… ou https://vm.tiktok.com/…"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="connect-button"
          disabled={!value.trim() || status === 'loading'}
        >
          {status === 'loading' ? 'Carregando…' : 'Tocar agora'}
        </button>
      </div>
      <p className="yt-link-hint">
        Do YouTube toca a faixa inteira. Do TikTok toca a música completa; se o som não tiver nome,
        toca o áudio do próprio vídeo.
      </p>
      {status === 'error' && <p className="yt-link-error">{message}</p>}
    </form>
  )
}
