import { useEffect, useState } from 'react'
import type { Track } from '../lib/catalog'
import { fetchLyrics, type LyricsResult } from '../lib/lyrics'

/** Folha com a letra completa da faixa em curso. */
export function LyricsSheet({ track, onClose }: { track: Track; onClose: () => void }) {
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLyrics(null)
    void fetchLyrics(track, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setLyrics(result)
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [track])

  const paragraphs = (lyrics?.plain ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet lyrics-sheet" role="dialog" aria-label="Letra" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Letra</h2>
            <p className="queue-context">
              {track.title} · {track.artist}
            </p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Fechar letra">
            ×
          </button>
        </div>

        {loading && <p className="sheet-empty">A procurar a letra…</p>}

        {!loading && !paragraphs.length && (
          <p className="sheet-empty">Não encontrei a letra desta faixa. Pode ainda não estar na base de letras.</p>
        )}

        {paragraphs.length > 0 && (
          <div className="lyrics-body">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
