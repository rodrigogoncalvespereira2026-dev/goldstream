export type View =
  | { type: 'home' }
  | { type: 'search' }
  | { type: 'library' }
  | { type: 'album'; id: string }
  | { type: 'playlist'; id: string }
  | { type: 'liked' }
  | { type: 'genre'; name: string }

export type Navigate = (view: View) => void
