import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayer, usePlayerTime } from './player'
import { getActiveLyricIndex, type SyncedLine } from './lyrics'

/**
 * A linha aparece um pouco antes de ser cantada: é assim que uma letra "parece"
 * certa (ler leva um instante) e compensa o atraso do player a reportar o tempo.
 */
const LEAD_SECONDS = 0.3

const OFFSETS_KEY = 'sonora:lyrics-offset'

const readOffsets = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(OFFSETS_KEY)
    const value = raw ? (JSON.parse(raw) as unknown) : {}
    return value && typeof value === 'object' ? (value as Record<string, number>) : {}
  } catch {
    return {}
  }
}

const saveOffset = (trackId: string, seconds: number) => {
  try {
    const all = readOffsets()
    if (seconds === 0) delete all[trackId]
    else all[trackId] = seconds
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(all))
  } catch {
    /* sem storage: o ajuste vale só nesta sessão */
  }
  // A prévia do "agora tocando" e a folha da letra usam o mesmo ajuste.
  window.dispatchEvent(new CustomEvent(OFFSET_EVENT, { detail: { trackId, seconds } }))
}

const OFFSET_EVENT = 'sonora:lyrics-offset'

/**
 * Linha ativa da letra, certa ao décimo de segundo.
 *
 * O tempo do player só chega de segundo a segundo no telemóvel (para poupar o
 * WebView), o que deixava a letra até 1,5 s atrasada. Aqui o tempo é estimado
 * entre atualizações (último tempo + o que passou desde então) e a troca de
 * linha é agendada para o instante exato. O ajuste manual cobre vídeos do
 * YouTube cuja introdução não bate com a versão de áudio da letra.
 */
export function useLyricClock(lines: SyncedLine[], trackId: string | undefined) {
  const { currentTime } = usePlayerTime()
  const { isPlaying: audioPlaying, watchInline, watchPlaying } = usePlayer()
  // Com o vídeo na capa, é ele que anda: a letra segue o vídeo.
  const isPlaying = audioPlaying || (watchInline && watchPlaying)
  const [index, setIndex] = useState(-1)
  const [offset, setOffset] = useState(0)
  const anchorRef = useRef({ time: currentTime, at: performance.now() })
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  // Cada tempo novo do player é a âncora a partir da qual se estima.
  if (anchorRef.current.time !== currentTime) {
    anchorRef.current = { time: currentTime, at: performance.now() }
  }

  useEffect(() => {
    setOffset(trackId ? readOffsets()[trackId] ?? 0 : 0)
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ trackId: string; seconds: number }>).detail
      if (detail?.trackId === trackId) setOffset(detail.seconds)
    }
    window.addEventListener(OFFSET_EVENT, onChange)
    return () => window.removeEventListener(OFFSET_EVENT, onChange)
  }, [trackId])

  useEffect(() => {
    if (!lines.length) {
      setIndex(-1)
      return
    }
    let timer = 0
    const update = () => {
      const anchor = anchorRef.current
      const elapsed = isPlaying ? (performance.now() - anchor.at) / 1000 : 0
      // Sem estimar mais de 2 s para lá do último tempo (player parado a carregar).
      const now = anchor.time + Math.min(elapsed, 2) + offset + LEAD_SECONDS
      const active = anchor.time > 0 ? getActiveLyricIndex(lines, now) : -1
      setIndex(active)
      const nextLine = lines[active + 1]
      if (isPlaying && nextLine) {
        const wait = Math.max(50, (nextLine.time - now) * 1000)
        timer = window.setTimeout(update, Math.min(wait, 1000))
      }
    }
    update()
    return () => window.clearTimeout(timer)
  }, [lines, currentTime, isPlaying, offset])

  const nudge = useCallback(
    (delta: number) => {
      // Ref e não o estado: dois toques antes de re-renderizar somam os dois.
      const next = Math.round((offsetRef.current + delta) * 10) / 10
      offsetRef.current = next
      setOffset(next)
      if (trackId) saveOffset(trackId, next)
    },
    [trackId],
  )

  const resetOffset = useCallback(() => {
    offsetRef.current = 0
    setOffset(0)
    if (trackId) saveOffset(trackId, 0)
  }, [trackId])

  return { index, offset, nudge, resetOffset }
}

/** "+0,5 s" / "−1,0 s": o ajuste em texto, como aparece nos botões. */
export const offsetText = (seconds: number): string =>
  `${seconds > 0 ? '+' : seconds < 0 ? '−' : ''}${Math.abs(seconds).toFixed(1).replace('.', ',')} s`
