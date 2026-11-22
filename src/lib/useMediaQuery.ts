import { useEffect, useState } from 'react'

/** Acompanha uma media query em tempo real (ex.: largura de telemóvel). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}
