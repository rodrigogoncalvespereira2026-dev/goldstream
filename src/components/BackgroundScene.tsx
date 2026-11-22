import { cx } from '../lib/format'
import type { BackgroundId } from '../lib/backgrounds'

type BackgroundSceneProps = {
  id: BackgroundId
  /** Versão pequena, usada nas miniaturas da página de fundos. */
  preview?: boolean
}

/** Camada decorativa animada. Puro CSS: não interfere com o áudio nem com os cliques. */
export function BackgroundScene({ id, preview }: BackgroundSceneProps) {
  if (id === 'none') return null
  return (
    <div
      className={cx('bg-scene', `bg-${id}`, preview && 'is-preview')}
      aria-hidden="true"
    >
      <span className="bg-blob a" />
      <span className="bg-blob b" />
      <span className="bg-blob c" />
      <span className="bg-shine" />
    </div>
  )
}
