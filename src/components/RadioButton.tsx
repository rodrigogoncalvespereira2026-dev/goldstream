import { useState } from 'react'
import { cx } from '../lib/format'
import { usePlayer } from '../lib/player'
import { artistRadio } from '../lib/radio'
import { RadioIcon } from './Icons'

type RadioButtonProps = {
  artist?: string
  variant?: 'pill' | 'icon'
}

/**
 * Rádio do artista: enche a fila com faixas do artista e parecidas. Aparece no player
 * (pill, no telemóvel) e na barra (ícone, no computador).
 */
export function RadioButton({ artist, variant = 'pill' }: RadioButtonProps) {
  const { playQueue } = usePlayer()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!artist) return null

  const start = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const tracks = await artistRadio(artist)
      if (!tracks.length) {
        setFailed(true)
        return
      }
      playQueue(
        tracks.map((track) => track.id),
        tracks[0].id,
      )
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={cx('icon-button', busy && 'is-busy')}
        onClick={() => void start()}
        aria-label={`Rádio de ${artist}`}
        title={failed ? 'Não foi possível abrir a rádio' : `Rádio de ${artist}`}
      >
        <RadioIcon size={18} />
      </button>
    )
  }

  return (
    <button type="button" className="np-radio" onClick={() => void start()} disabled={busy}>
      <RadioIcon size={17} />
      {busy ? 'A preparar rádio…' : failed ? 'Tentar rádio outra vez' : 'Rádio do artista'}
    </button>
  )
}
