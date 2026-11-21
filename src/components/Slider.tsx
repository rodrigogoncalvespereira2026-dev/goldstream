import { useCallback, useRef, useState } from 'react'
import { cx } from '../lib/format'

type SliderProps = {
  value: number
  max: number
  onChange: (value: number) => void
  ariaLabel: string
  className?: string
  hideThumb?: boolean
}

export function Slider({ value, max, onChange, ariaLabel, className, hideThumb }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const ratioFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (!rect.width) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const safeMax = max > 0 && Number.isFinite(max) ? max : 1
  const ratio = Math.min(1, Math.max(0, value / safeMax))

  return (
    <div
      ref={trackRef}
      className={cx('slider', className, dragging && 'is-dragging')}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Number(safeMax.toFixed(2))}
      aria-valuenow={Number(value.toFixed(2))}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
        onChange(ratioFromPointer(event.clientX) * safeMax)
      }}
      onPointerMove={(event) => {
        if (!dragging) return
        onChange(ratioFromPointer(event.clientX) * safeMax)
      }}
      onPointerUp={(event) => {
        setDragging(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          onChange(Math.min(safeMax, value + safeMax * 0.05))
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onChange(Math.max(0, value - safeMax * 0.05))
        }
      }}
    >
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${ratio * 100}%` }} />
        {!hideThumb && <div className="slider-thumb" style={{ left: `${ratio * 100}%` }} />}
      </div>
    </div>
  )
}
