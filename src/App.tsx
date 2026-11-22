import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { PlayerBar } from './components/PlayerBar'
import { MobileNav } from './components/MobileNav'
import { YouTubeStage } from './components/YouTubeStage'
import { WatchVideo } from './components/WatchVideo'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
import { Library } from './pages/Library'
import { Settings } from './pages/Settings'
import { Profile } from './pages/Profile'
import { Backgrounds } from './pages/Backgrounds'
import { BackgroundScene } from './components/BackgroundScene'
import { useBackground } from './lib/backgrounds'
import { Collection } from './pages/Collection'
import { PlayerProvider, usePlayer } from './lib/player'
import { GENRES, getAlbum, getPlaylist } from './lib/catalog'
import { cx } from './lib/format'
import type { View } from './lib/nav'

const tintFor = (view: View): string => {
  switch (view.type) {
    case 'album':
      return getAlbum(view.id)?.tint ?? '#252525'
    case 'playlist':
      return getPlaylist(view.id)?.tint ?? '#252525'
    case 'liked':
      return '#3f1d80'
    case 'genre':
      return GENRES.find((genre) => genre.name === view.name)?.from ?? '#252525'
    default:
      return '#252525'
  }
}

function Shell() {
  const { toggle, next } = usePlayer()
  const [history, setHistory] = useState<View[]>([{ type: 'home' }])
  const [pointer, setPointer] = useState(0)
  const [query, setQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const view = history[pointer] ?? history[0]

  const navigate = useCallback(
    (target: View) => {
      // Um tema/cartão pode abrir a busca já com o termo escolhido.
      if (target.type === 'search' && target.query) setQuery(target.query)
      setHistory((previous) => {
        const trimmed = previous.slice(0, pointer + 1)
        return [...trimmed, target]
      })
      setPointer(pointer + 1)
    },
    [pointer],
  )

  const back = useCallback(() => setPointer((value) => Math.max(0, value - 1)), [])
  const forward = useCallback(
    () => setPointer((value) => Math.min(history.length - 1, value + 1)),
    [history.length],
  )

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 })
    setScrolled(false)
  }, [view])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        event.defaultPrevented ||
        (target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'A' ||
            target.isContentEditable ||
            target.closest('button, [role="button"], [role="slider"]')))
      ) {
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      }
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle, next])

  const handleQuery = useCallback(
    (value: string) => {
      setQuery(value)
      if (view.type !== 'search') navigate({ type: 'search' })
    },
    [view.type, navigate],
  )

  const tint = useMemo(() => tintFor(view), [view])
  const [background] = useBackground()

  const activeQuery = view.type === 'search' && view.query ? view.query : query

  const content = (() => {
    switch (view.type) {
      case 'search':
        return <Search query={activeQuery} navigate={navigate} />
      case 'library':
        return <Library navigate={navigate} />
      case 'settings':
        return <Settings navigate={navigate} />
      case 'profile':
        return <Profile navigate={navigate} />
      case 'backgrounds':
        return <Backgrounds />
      case 'album':
      case 'playlist':
      case 'liked':
      case 'genre':
        return <Collection view={view} navigate={navigate} />
      default:
        return <Home navigate={navigate} />
    }
  })()

  return (
    <div className="app-shell">
      <div className="app-grid">
        <Sidebar view={view} navigate={navigate} />

        <main
          className={cx('main', background !== 'none' && 'has-scene')}
          style={{
            background:
              background === 'none'
                ? `linear-gradient(180deg, ${tint} 0%, #121212 420px)`
                : `linear-gradient(180deg, ${tint}55 0%, rgba(10, 10, 10, 0.5) 420px)`,
          }}
        >
          <BackgroundScene id={background} />
          <div
            className="scroller"
            ref={scrollerRef}
            onScroll={(event) => {
              const next = event.currentTarget.scrollTop > 16
              setScrolled((previous) => (previous === next ? previous : next))
            }}
          >
            <TopBar
              navigate={navigate}
              query={activeQuery}
              onQuery={handleQuery}
              canGoBack={pointer > 0}
              canGoForward={pointer < history.length - 1}
              onBack={back}
              onForward={forward}
              scrolled={scrolled}
            />
            <div className="page">{content}</div>
          </div>
        </main>
      </div>

      <PlayerBar />
      <MobileNav view={view} navigate={navigate} />
      <YouTubeStage />
      <WatchVideo />
    </div>
  )
}

export default function App() {
  return (
    <PlayerProvider>
      <Shell />
    </PlayerProvider>
  )
}
