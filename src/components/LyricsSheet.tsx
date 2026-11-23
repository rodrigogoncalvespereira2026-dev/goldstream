import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

  // Atualiza a linha da letra ativa com base no tempo atual da música.
  useEffect(() => {
    if (!syncedLines.length || !currentTime) {
      setActiveLineIndex(-1)
      return
    }
    const idx = getActiveLyricIndex(syncedLines, currentTime)
    setActiveLineIndex(idx)
  }, [currentTime, syncedLines])

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

        {lyrics && <p className="lyrics-source">Letra disponibilizada por Musixmatch</p>}
      </div>
    </div>,
    document.body,
  )
}
