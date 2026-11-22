export type View =
  | { type: 'home' }
  | { type: 'search'; query?: string }
  | { type: 'library' }
  | { type: 'settings' }
  | { type: 'profile' }
  | { type: 'album'; id: string }
  | { type: 'playlist'; id: string }
  | { type: 'liked' }
  | { type: 'genre'; name: string }

export type Navigate = (view: View) => void
