import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/format'
import type { Track } from '../lib/catalog'
import { fetchLyrics, type LyricsResult, parseSyncedLyrics, type SyncedLine } from '../lib/lyrics'
import { offsetText, useLyricClock } from '../lib/useLyricClock'

/** Folha com a letra completa da faixa em curso. */
export function LyricsSheet({ track, onClose }: { track: Track; onClose: () => void }) {
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null)
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([])
  const [loading, setLoading] = useState(true)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const activeLineRef = useRef<HTMLParagraphElement | null>(null)

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

  // Linha ativa certa ao décimo de segundo, com o ajuste guardado para esta faixa.
  const { index: activeLineIndex, offset, nudge, resetOffset } = useLyricClock(
    syncedLines,
    track.id,
  )

  // A letra acompanha a música: a linha ativa fica sempre ao centro da folha.
  useEffect(() => {
    const body = bodyRef.current
    const line = activeLineRef.current
    if (!body || !line || activeLineIndex < 0) return
    const bodyRect = body.getBoundingClientRect()
    const lineRect = line.getBoundingClientRect()
    const target =
      body.scrollTop + (lineRect.top - bodyRect.top) - body.clientHeight / 2 + lineRect.height / 2
    body.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeLineIndex])

  // Fechar com Escape, como qualquer folha.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const plainLines = (lyrics?.plain ?? '')
    .split('\n')
    .filter((line) => line.trim())

  // A folha vive dentro do "agora tocando", que tem transform e scroll próprios:
  // um position: fixed ali ficava relativo a esse contentor. No body fica sempre
  // por cima do player.
  return createPortal(
    <div className="sheet-backdrop lyrics-backdrop" onClick={onClose}>
      <div
        className="sheet lyrics-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lyrics-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="lyrics-header">
          <div className="lyrics-title-wrapper">
            <h2 className="lyrics-title" id="lyrics-sheet-title">
              Letra
            </h2>
            <p className="lyrics-subtitle">
              {track.title} · {track.artist}
            </p>
          </div>
          <button type="button" className="lyrics-close" onClick={onClose} aria-label="Fechar letra">
            ×
          </button>
        </header>

        {loading && <p className="sheet-empty">A procurar a letra…</p>}

        {!loading && !lyrics && (
          <p className="sheet-empty">
            Não encontrei a letra desta faixa. Pode ainda não estar na base de letras.
          </p>
        )}

        {lyrics && (
          <div className="lyrics-body" ref={bodyRef}>
            <div className="lyrics-container">
              {syncedLines.length ? (
                syncedLines.map((line, index) => {
                  const isActive = index === activeLineIndex
                  return (
                    <p
                      key={index}
                      ref={isActive ? activeLineRef : undefined}
                      className={cx('lyrics-line', {
                        'is-active': isActive,
                        'is-passed': index < activeLineIndex,
                      })}
                    >
                      {line.text}
                    </p>
                  )
                })
              ) : (
                plainLines.map((line, index) => (
                  <p key={index} className="lyrics-line">
                    {line}
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        {syncedLines.length > 0 && (
          <div className="lyrics-sync" role="group" aria-label="Acertar o tempo da letra">
            <button type="button" onClick={() => nudge(-0.5)} aria-label="Letra mais tarde">
              −0,5 s
            </button>
            <button
              type="button"
              className="lyrics-sync-value"
              onClick={resetOffset}
              disabled={offset === 0}
              aria-label="Repor o tempo original da letra"
            >
              {offset === 0 ? 'Tempo da letra' : offsetText(offset)}
            </button>
            <button type="button" onClick={() => nudge(0.5)} aria-label="Letra mais cedo">
              +0,5 s
            </button>
          </div>
        )}

        {lyrics && <p className="lyrics-source">Letra disponibilizada pelo LRCLIB</p>}
      </div>
    </div>,
    document.body,
  )
}
