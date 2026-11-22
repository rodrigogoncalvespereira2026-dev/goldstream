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

export const SettingsIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
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
  <svg {...base(size)} {...rest} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12v2a7 7 0 0 0 7 7h2" />
    <path d="m21 5-3 3 3 3" />
    <path d="M21 12v-2a7 7 0 0 0-7-7h-2" />
    <path d="m3 19 3-3-3-3" />
  </svg>
)

export const RepeatOneIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12v2a7 7 0 0 0 7 7h2" />
    <path d="m21 5-3 3 3 3" />
    <path d="M21 12v-2a7 7 0 0 0-7-7h-2" />
    <path d="m3 19 3-3-3-3" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
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

export const RefreshIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.9-6.4" />
    <path d="M20.8 3.4v5.2h-5.2" />
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

export const ChevronDownIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="m5 9 7 7 7-7" />
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

export const LyricsIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M5 4.5h9.5L19 9v10.5H5z" />
    <path d="M8 9.5h4M8 13h7M8 16.5h5" />
  </svg>
)

export const ShareIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="17.5" cy="6" r="2.5" />
    <circle cx="6.5" cy="12" r="2.5" />
    <circle cx="17.5" cy="18" r="2.5" />
    <path d="M8.8 10.8 15.2 7.2M8.8 13.2l6.4 3.6" />
  </svg>
)

export const TimerIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="13.5" r="7" />
    <path d="M12 10v3.8l2.4 1.6" />
    <path d="M9.5 3.5h5" />
  </svg>
)

export const MusicNoteIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M9 17.5V5.2l10-2v11.6" />
    <circle cx="6.6" cy="17.8" r="2.4" />
    <circle cx="16.6" cy="14.8" r="2.4" />
  </svg>
)

export const SparkleIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M11 4l1.7 4.6L17 10l-4.3 1.4L11 16l-1.7-4.6L5 10l4.3-1.4z" />
    <path d="M17.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
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

export const UserIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M5 20c0-3.2 3.1-5.2 7-5.2s7 2 7 5.2" />
  </svg>
)

export const RadioIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="2.4" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4" />
    <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" />
  </svg>
)

export const VideoIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="m10.5 9.5 4.5 2.5-4.5 2.5z" />
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
