/**
 * Pelagic icon set — custom 24-grid line icons, 1.25px stroke.
 * Ported 1:1 from design_handoff_pelagic/pelagic-kit.js.
 * Sizes: 21px inside buttons, 17–20px in rows/nav, 22px in Android tabs.
 */
import type { CSSProperties, SVGProps } from 'react'

type Shape =
  | string // path "d" with default stroke
  | ['path', SVGProps<SVGPathElement>]
  | ['circle', SVGProps<SVGCircleElement>]
  | ['rect', SVGProps<SVGRectElement>]

const fill = { fill: 'currentColor', stroke: 'none' } as const
const HEART = 'M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z'
const BELL = 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z'

export const ICON_PATHS = {
  playF: [['path', { d: 'M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8z', ...fill }]],
  pauseF: [
    ['rect', { x: 7, y: 5, width: 3, height: 14, rx: 0.8, ...fill }],
    ['rect', { x: 14, y: 5, width: 3, height: 14, rx: 0.8, ...fill }],
  ],
  prev: [['path', { d: 'M18 6.5v11a.6.6 0 0 1-.9.5L9 12.5a.6.6 0 0 1 0-1L17.1 6a.6.6 0 0 1 .9.5z', ...fill }], 'M6 6v12'],
  next: [['path', { d: 'M6 6.5v11a.6.6 0 0 0 .9.5L15 12.5a.6.6 0 0 0 0-1L6.9 6a.6.6 0 0 0-.9.5z', ...fill }], 'M18 6v12'],
  shuffle: ['M4 7h3c4.5 0 5.5 10 10 10h3', 'M4 17h3c1.6 0 2.7-1.3 3.6-3', 'M13.4 10c.9-1.7 2-3 3.6-3h3', 'M17.5 4.5 20 7l-2.5 2.5', 'M17.5 14.5 20 17l-2.5 2.5'],
  repeat: ['M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20', 'M17 3l3 3-3 3', 'M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4', 'M7 21l-3-3 3-3'],
  home: ['M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'],
  library: ['M5 4v16', 'M9.5 4v16', 'M14 5l5 14.5'],
  search: [['circle', { cx: 11, cy: 11, r: 6.5 }], 'M20 20l-4.3-4.3'],
  newr: [['circle', { cx: 12, cy: 12, r: 2.5 }], ['circle', { cx: 12, cy: 12, r: 7 }], 'M12 2v2M12 20v2'],
  upload: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15'],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15'],
  check: [['circle', { cx: 12, cy: 12, r: 8.5 }], 'M8.5 12.3l2.4 2.4 4.6-5'],
  cloud: ['M7.5 18h9.5a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.9 9.6 4.2 4.2 0 0 0 7.5 18z'],
  queue: ['M4 6h16', 'M4 11h16', 'M4 16h8', ['path', { d: 'M15.5 14v6l5-3z', ...fill }]],
  lyrics: ['M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M8 9h8', 'M8 12h5'],
  volume: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
  mute: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  heart: [HEART],
  heartF: [['path', { d: HEART, fill: 'currentColor' }]],
  more: [
    ['circle', { cx: 5.5, cy: 12, r: 1.1, ...fill }],
    ['circle', { cx: 12, cy: 12, r: 1.1, ...fill }],
    ['circle', { cx: 18.5, cy: 12, r: 1.1, ...fill }],
  ],
  chevD: ['M6 9.5l6 6 6-6'],
  chevL: ['M14.5 6l-6 6 6 6'],
  chevR: ['M9.5 6l6 6-6 6'],
  chevU: ['M6 14.5l6-6 6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  clock: [['circle', { cx: 12, cy: 12, r: 8.5 }], 'M12 7.5V12l3 2'],
  smart: ['M4 6h9', 'M4 11h7', 'M4 16h6', ['path', { d: 'M17.5 9.5l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z', strokeLinejoin: 'round' }]],
  playlist: ['M4 6h11', 'M4 11h11', 'M4 16h6', ['circle', { cx: 16.5, cy: 17, r: 2.5 }], 'M19 17V7.5l2-1'],
  offline: ['M3 3l18 18', 'M8.5 8.6A9 9 0 0 0 3.5 10', 'M20.5 10a9 9 0 0 0-6-2.4', 'M6.5 13.5a6 6 0 0 1 5.5-1.6', 'M12 18.5h.01'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  drag: ['M5 9h14', 'M5 15h14'],
  grid: [
    ['rect', { x: 4, y: 4, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 2 }],
  ],
  refresh: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v3.2h-3.2'],
  bell: [BELL, 'M10 20.5a2 2 0 0 0 4 0'],
  bellF: [['path', { d: BELL, fill: 'currentColor' }], 'M10 20.5a2 2 0 0 0 4 0'],
  ext: ['M13.5 5.5h5v5', 'M18.5 5.5 11 13', 'M17 13.5v4a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4'],
  eye: ['M2.8 12S6.2 6 12 6s9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z', ['circle', { cx: 12, cy: 12, r: 2.6 }]],
  gear: [['circle', { cx: 12, cy: 12, r: 2.8 }], 'M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6'],
  alert: [['circle', { cx: 12, cy: 12, r: 8.5 }], 'M12 7.8v5', 'M12 16.2h.01'],
} satisfies Record<string, Shape[]>

export type IconName = keyof typeof ICON_PATHS
export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[]

export interface IconProps {
  name: IconName
  /** px; defaults to 1em so it follows font-size */
  size?: number | string
  className?: string
  style?: CSSProperties
  /** accessible label; omit for decorative icons */
  title?: string
}

export function Icon({ name, size = '1em', className, style, title }: IconProps) {
  const shapes: Shape[] = ICON_PATHS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', flex: 'none', ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {shapes.map((s, i) => {
        if (typeof s === 'string') return <path key={i} d={s} />
        const [tag, props] = s
        if (tag === 'circle') return <circle key={i} {...props} />
        if (tag === 'rect') return <rect key={i} {...props} />
        return <path key={i} {...props} />
      })}
    </svg>
  )
}
