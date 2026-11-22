import { cx } from '../lib/format'
import { initialOf } from '../lib/profile'

type AvatarProps = {
  name: string
  photo?: string
  className?: string
}

/** Círculo do perfil: mostra a foto escolhida ou a inicial do nome. */
export function Avatar({ name, photo, className }: AvatarProps) {
  return (
    <span
      className={cx('avatar', photo && 'has-photo', className)}
      style={photo ? { backgroundImage: `url("${photo}")` } : undefined}
      aria-hidden="true"
    >
      {photo ? null : initialOf(name)}
    </span>
  )
}
