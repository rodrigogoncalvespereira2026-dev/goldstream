import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
})

export const HomeIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M3 10.6 12 3.4l9 7.2V20a1 1 0 0 1-1 1h-5v-6.4H9V21H4a1 1 0 0 1-1-1z" />
  </svg>
)

export const SearchIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 5 5" />
  </svg>
)

export const LibraryIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 4v16M8.6 4v16M13.4 4.6l3.8 14.6" />
    <path d="M19.4 6.2 22 5" />
  </svg>
)

export const PlayIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest} fill="currentColor" stroke="none">
    <path d="M7.5 4.6c0-.8.9-1.3 1.6-.9l10.2 6.5c.7.4.7 1.5 0 1.9L9.1 19.8c-.7.4-1.6-.1-1.6-.9z" />
  </svg>
)

export const PauseIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="3.8" height="16" rx="1.2" />
    <rect x="14.2" y="4" width="3.8" height="16" rx="1.2" />
  </svg>
)

export const PrevIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest} fill="currentColor" stroke="none">
    <rect x="4" y="5" width="2.6" height="14" rx="1.2" />
    <path d="M20 6.2v11.6c0 .8-.9 1.3-1.6.9l-8.6-5.8a1.1 1.1 0 0 1 0-1.8l8.6-5.8c.7-.4 1.6.1 1.6.9z" />
  </svg>
)

export const NextIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest} fill="currentColor" stroke="none">
    <rect x="17.4" y="5" width="2.6" height="14" rx="1.2" />
    <path d="M4 6.2v11.6c0 .8.9 1.3 1.6.9l8.6-5.8a1.1 1.1 0 0 0 0-1.8L5.6 5.3C4.9 4.9 4 5.4 4 6.2z" />
  </svg>
)

export const ShuffleIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M3 6h3.4c1.2 0 2.3.6 3 1.6l5.2 8c.7 1 1.8 1.6 3 1.6H21" />
    <path d="M3 18h3.4c1.2 0 2.3-.6 3-1.6l1.2-1.9" />
    <path d="M13.6 9.4 14.6 8c.7-1 1.8-1.6 3-1.6H21" />
    <path d="m18 3.8 3 2.4-3 2.4M18 14.8l3 2.4-3 2.4" />
  </svg>
)

export const RepeatIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M6 5.6h11.4a3.6 3.6 0 0 1 3.6 3.6v2" />
    <path d="m14.6 2.8 3 2.8-3 2.8" />
    <path d="M18 18.4H6.6A3.6 3.6 0 0 1 3 14.8v-2" />
    <path d="m9.4 21.2-3-2.8 3-2.8" />
  </svg>
)

export const RepeatOneIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M6 5.6h11.4a3.6 3.6 0 0 1 3.6 3.6v2" />
    <path d="m14.6 2.8 3 2.8-3 2.8" />
    <path d="M18 18.4H6.6A3.6 3.6 0 0 1 3 14.8v-2" />
    <path d="m9.4 21.2-3-2.8 3-2.8" />
    <path d="M11 10.6h1.6V15" strokeWidth={1.6} />
  </svg>
)

export const HeartIcon = ({ size = 24, filled = false, ...rest }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)} {...rest} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.5s-7.6-4.6-9.4-9A5.3 5.3 0 0 1 12 6.5a5.3 5.3 0 0 1 9.4 5c-1.8 4.4-9.4 9-9.4 9z" />
  </svg>
)

export const PlusIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 4.5v15M4.5 12h15" />
  </svg>
)

export const MoreIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

export const ClockIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.4V12l3.2 2" />
  </svg>
)

export const ArrowLeftIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M14.5 5 7.5 12l7 7" />
  </svg>
)

export const ArrowRightIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="m9.5 5 7 7-7 7" />
  </svg>
)

export const VolumeIcon = ({ size = 24, level = 2, ...rest }: IconProps & { level?: 0 | 1 | 2 }) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor" stroke="none" />
    {level === 0 ? (
      <path d="m16 9.5 4.5 5M20.5 9.5 16 14.5" />
    ) : (
      <>
        <path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8" />
        {level === 2 && <path d="M18 6a8.2 8.2 0 0 1 0 12" />}
      </>
    )}
  </svg>
)

export const QueueIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 6.5h11M4 12h11M4 17.5h7" />
    <path d="M18.5 8v8.2a2.4 2.4 0 1 1-2-2.4" />
  </svg>
)

export const MusicNoteIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M9 17.5V5.2l10-2v11.6" />
    <circle cx="6.6" cy="17.8" r="2.4" />
    <circle cx="16.6" cy="14.8" r="2.4" />
  </svg>
)

export const CheckIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

export const DownloadIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 4v10.4M7.5 10.6 12 15l4.5-4.4" />
    <path d="M4.5 18.5h15" />
  </svg>
)

export const LogoMark = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <circle cx="16" cy="16" r="16" fill="currentColor" />
    <g fill="#000">
      <rect x="9" y="12" width="2.4" height="8" rx="1.2" />
      <rect x="14.8" y="8" width="2.4" height="16" rx="1.2" />
      <rect x="20.6" y="14" width="2.4" height="5" rx="1.2" />
    </g>
  </svg>
)
