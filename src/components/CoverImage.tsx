import { useState } from 'react'

export const FALLBACK_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#282828"/><g fill="#8a8a8a"><circle cx="150" cy="258" r="33"/><circle cx="272" cy="234" r="33"/><rect x="176" y="118" width="16" height="137" rx="8"/><rect x="298" y="94" width="16" height="137" rx="8"/><path d="M176 118l138-24v34l-138 24z"/></g></svg>',
  )

type CoverImageProps = {
  src: string
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
}

/** Imagem de capa com placeholder quando a capa falta ou o host externo falha. */
export function CoverImage({ src, alt = '', className, loading = 'lazy' }: CoverImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc === src

  return (
    <img
      className={className}
      src={!src || failed ? FALLBACK_COVER : src}
      alt={alt}
      loading={loading}
      onError={() => setFailedSrc(src)}
    />
  )
}
