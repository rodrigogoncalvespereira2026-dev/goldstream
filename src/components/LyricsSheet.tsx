import { useEffect, useState } from 'react'
import { cx } from '../lib/format'
import type { Track } from '../lib/catalog'
import { usePlayerTime } from '../lib/player'
import { fetchLyrics, type LyricsResult, parseSyncedLyrics, getActiveLyricIndex, type SyncedLine } from '../lib/lyrics'

/** Folha com a letra completa da faixa em curso. */
export function LyricsSheet({ track, onClose }: { track: Track; onClose: () => void }) {
  const { currentTime } = usePlayerTime()
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null)
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([])
  const [activeLineIndex, setActiveLineIndex] = useState(-1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLyrics(null)
    setSyncedLines([])
    void fetchLyrics(track, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setLyrics(result)
          setSyncedLines(parseSyncedLyrics(result?.sync))
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [track])

  // Atualiza a linha da letra ativa com base no tempo atual da música.
  useEffect(() => {
    if (!syncedLines.length || !currentTime) {
      setActiveLineIndex(-1)
      return
    }
    const idx = getActiveLyricIndex(syncedLines, currentTime)
    setActiveLineIndex(idx)
  }, [currentTime, syncedLines])

  const plainLines = (lyrics?.plain ?? '')
    .split('\n')
    .filter((line) => line.trim())

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

        {!loading && !lyrics && (
          <p className="sheet-empty">Não encontrei a letra desta faixa. Pode ainda não estar na base de letras.</p>
        )}

        {lyrics && (
          <div className="lyrics-body">
            {syncedLines.length ? (
              syncedLines.map((line, index) => (
                <p
                  key={index}
                  className={cx('lyrics-line', {
                    'is-active': index === activeLineIndex,
                    'is-passed': index < activeLineIndex,
                  })}
                >
                  {line.text}
                </p>
              ))
            ) : (
              plainLines.map((line, index) => (
                <p key={index} className="lyrics-line">
                  {line}
                </p>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
