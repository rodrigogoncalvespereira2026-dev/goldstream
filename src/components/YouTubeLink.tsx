import { useState } from 'react'
import { usePlayer } from '../lib/player'
import { trackFromYouTubeLink } from '../lib/youtube'
import { fecharTeclado } from '../lib/teclado'

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
          const track = await trackFromYouTubeLink(link)
          if (!track) {
            setStatus('error')
            setMessage(
              'Não reconheci esse link. Cole algo como https://www.youtube.com/watch?v=… ou https://youtu.be/…',
            )
            return
          }
          playQueue([track.id], track.id)
          setValue('')
          setStatus('idle')
        } catch {
          setStatus('error')
          setMessage('Não foi possível carregar esse vídeo agora. Tente de novo.')
        }
      }}
    >
      <label className="yt-link-label" htmlFor="yt-link">
        Cole o link de uma música do YouTube e toque inteira
      </label>
      <div className="yt-link-row">
        <input
          id="yt-link"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            if (status === 'error') setStatus('idle')
          }}
          placeholder="https://www.youtube.com/watch?v=…"
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
      <p className="yt-link-hint">A música toca inteira no player do YouTube.</p>
      {status === 'error' && <p className="yt-link-error">{message}</p>}
    </form>
  )
}
