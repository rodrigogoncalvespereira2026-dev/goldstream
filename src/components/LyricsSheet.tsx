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
    <div className="sheet-backdrop lyrics-backdrop" onClick={onClose}>
      <div className="sheet lyrics-sheet" role="dialog" aria-label="Letra" onClick={(event) => event.stopPropagation()}>
        <div className="lyrics-header">
          <div className="lyrics-title-wrapper">
            <h2 className="lyrics-title">Letra</h2>
            <div className="lyrics-header-actions">
              <button type="button" className="icon-button lyrics-btn" onClick={() => {}} aria-label="Ver em tela cheia">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M0.25 3C0.25 2.0335 1.0335 1.25 2 1.25H5.375V2.75H2C1.86193 2.75 1.75 2.86193 1.75 3V5.42857H0.25V3ZM14 2.75H10.625V1.25H14C14.9665 1.25 15.75 2.0335 15.75 3V5.42857H14.25V3C14.25 2.86193 14.1381 2.75 14 2.75ZM1.75 10.5714V13C1.75 13.1381 1.86193 13.25 2 13.25H5.375V14.75H2C1.0335 14.75 0.25 13.9665 0.25 13V10.5714H1.75ZM14.25 13V10.5714H15.75V13C15.75 13.9665 14.9665 14.75 14 14.75H10.625V13.25H14C14.1381 13.25 14.25 13.1381 14.25 13Z" fill="currentColor"></path>
                </svg>
              </button>
              <button type="button" className="icon-button lyrics-btn" onClick={() => {}} aria-label="Abrir no modo cinema">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.53 9.47a.75.75 0 0 1 0 1.06l-2.72 2.72h1.018a.75.75 0 0 1 0 1.5H1.25v-3.579a.75.75 0 0 1 1.5 0v1.018l2.72-2.72a.75.75 0 0 1 1.06 0zm2.94-2.94a.75.75 0 0 1 0-1.06l2.72-2.72h-1.018a.75.75 0 1 1 0-1.5h3.578v3.579a.75.75 0 0 1-1.5 0V3.81l-2.72 2.72a.75.75 0 0 1-1.06 0"></path>
                </svg>
              </button>
            </div>
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
            <div className="lyrics-container">
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
            <p className="lyrics-source">Letra disponibilizada por Musixmatch</p>
          </div>
        )}
      </div>
    </div>
  )
}
