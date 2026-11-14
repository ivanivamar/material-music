/**
 * Pelagic icon set — custom 24-grid line icons, 1.25px stroke, round caps and joins.
 * The original 44 are ported 1:1 from design_handoff_pelagic/pelagic-kit.js; the icons added after
 * it (concerts, devices, health, settings rows, …) are drawn in the same hand: 24 grid, shapes kept
 * inside ~3.5–20.5, no fills except small dots, playback glyphs and the filled variants.
 *
 * Sizing: the <svg> is 1em square and carries the `ms` class, so every `.x .ms { font-size }` rule
 * in the stylesheets sizes it (21px inside buttons, 17–20px in rows and nav, 22px in Android tabs).
 * `filled` (or a name ending in F) draws the solid variant where the icon has one (heart, bell,
 * bookmark, location, spark, check circle); other icons ignore it.
 */
import type { CSSProperties, SVGProps } from 'react'

type Shape =
  | string // path "d" with the default stroke
  | ['path', SVGProps<SVGPathElement>]
  | ['circle', SVGProps<SVGCircleElement>]
  | ['rect', SVGProps<SVGRectElement>]

const fill = { fill: 'currentColor', stroke: 'none' } as const
const dot = (cx: number, cy: number, r = 1.1): Shape => ['circle', { cx, cy, r, ...fill }]
const solid = (d: string): Shape => ['path', { d, fill: 'currentColor' }]
/** strokes drawn in the page colour over a solid shape (the check inside a filled circle) */
const knock = (d: string): Shape => ['path', { d, stroke: 'var(--bg-1, #0B0B0C)', strokeWidth: 1.6 }]

/** the handoff heart, scaled ×1.22 so it spans the grid like the other icons (3.5–20.5) */
const HEART = 'M12 20.3s-8.54-5.25-8.54-11.71A4.76 4.76 0 0 1 12 5.82a4.76 4.76 0 0 1 8.54 2.81c0 6.46-8.54 11.71-8.54 11.71z'
const BELL = 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z'
const BELL_CLAPPER = 'M10 20.5a2 2 0 0 0 4 0'
const SPARK = 'M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5z'
const BOOKMARK = 'M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z'
const PIN = 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z'
const FOLDER = 'M3.5 7v10a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z'
const CLOUD = 'M7.5 18h9.5a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.9 9.6 4.2 4.2 0 0 0 7.5 18z'
const TICKET = 'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z'
const EYE = 'M2.8 12S6.2 6 12 6s9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z'
const CHECK = 'M5 12.5l4.5 4.5L19 7.5'
const ARROW_R = ['M5 12h14', 'M13 6l6 6-6 6']
const LOOP = ['M5 12a7 7 0 0 1 12-4.9', 'M17.5 3.8v3.6h-3.6', 'M19 12a7 7 0 0 1-12 4.9', 'M6.5 20.2v-3.6h3.6']
const REFRESH = ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v3.2h-3.2']
const REPEAT = ['M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20', 'M17 3l3 3-3 3', 'M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4', 'M7 21l-3-3 3-3']
const RING: Shape = ['circle', { cx: 12, cy: 12, r: 8.5 }]
/** calendar page: frame, header rule, two rings */
const CAL: Shape[] = [['rect', { x: 4, y: 5.5, width: 16, height: 14.5, rx: 2 }], 'M4 10h16', 'M8.5 3.5v4', 'M15.5 3.5v4']
const LOCK: Shape[] = [['rect', { x: 5.5, y: 10.5, width: 13, height: 9.5, rx: 2 }], 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5']
const PERSON: Shape[] = [['circle', { cx: 9.5, cy: 8.5, r: 3.5 }], 'M3.5 20c.6-3.6 3.1-6 6-6 1.4 0 2.7.5 3.7 1.4']
const DISC: Shape[] = [['circle', { cx: 12, cy: 12, r: 8.5 }], ['circle', { cx: 12, cy: 12, r: 2.5 }], ['path', { d: 'M7.6 12A4.4 4.4 0 0 1 12 7.6', strokeOpacity: 0.55 }]]
const RADIO: Shape[] = [['circle', { cx: 12, cy: 12, r: 8, strokeOpacity: 0.5 }], ['circle', { cx: 12, cy: 12, r: 3.2 }], ['circle', { cx: 17.66, cy: 6.34, r: 1.6, ...fill }]]
const GEAR =
  'M10.44 5.49L10.73 3.49A8.6 8.6 0 0 1 13.27 3.49L13.56 5.49A6.7 6.7 0 0 1 15.50 6.29L17.12 5.09A8.6 8.6 0 0 1 18.91 6.88L17.71 8.50A6.7 6.7 0 0 1 18.51 10.44L20.51 10.73A8.6 8.6 0 0 1 20.51 13.27L18.51 13.56A6.7 6.7 0 0 1 17.71 15.50L18.91 17.12A8.6 8.6 0 0 1 17.12 18.91L15.50 17.71A6.7 6.7 0 0 1 13.56 18.51L13.27 20.51A8.6 8.6 0 0 1 10.73 20.51L10.44 18.51A6.7 6.7 0 0 1 8.50 17.71L6.88 18.91A8.6 8.6 0 0 1 5.09 17.12L6.29 15.50A6.7 6.7 0 0 1 5.49 13.56L3.49 13.27A8.6 8.6 0 0 1 3.49 10.73L5.49 10.44A6.7 6.7 0 0 1 6.29 8.50L5.09 6.88A8.6 8.6 0 0 1 6.88 5.09L8.50 6.29A6.7 6.7 0 0 1 10.44 5.49z'

export const ICON_PATHS = {
  /* ── original set (pelagic-kit.js) ── */
  playF: [['path', { d: 'M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8z', ...fill }]],
  pauseF: [
    ['rect', { x: 7, y: 5, width: 3, height: 14, rx: 0.8, ...fill }],
    ['rect', { x: 14, y: 5, width: 3, height: 14, rx: 0.8, ...fill }],
  ],
  prev: [['path', { d: 'M18 6.5v11a.6.6 0 0 1-.9.5L9 12.5a.6.6 0 0 1 0-1L17.1 6a.6.6 0 0 1 .9.5z', ...fill }], 'M6 6v12'],
  next: [['path', { d: 'M6 6.5v11a.6.6 0 0 0 .9.5L15 12.5a.6.6 0 0 0 0-1L6.9 6a.6.6 0 0 0-.9.5z', ...fill }], 'M18 6v12'],
  shuffle: ['M4 7h3c4.5 0 5.5 10 10 10h3', 'M4 17h3c1.6 0 2.7-1.3 3.6-3', 'M13.4 10c.9-1.7 2-3 3.6-3h3', 'M17.5 4.5 20 7l-2.5 2.5', 'M17.5 14.5 20 17l-2.5 2.5'],
  repeat: REPEAT,
  home: ['M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'],
  library: ['M5 4v16', 'M9.5 4v16', 'M14 5l5 14.5'],
  search: [['circle', { cx: 11, cy: 11, r: 6.5 }], 'M20 20l-4.3-4.3'],
  /** New releases: a record with a fresh sparkle */
  newr: [
    ['circle', { cx: 10.5, cy: 13.5, r: 7 }],
    ['circle', { cx: 10.5, cy: 13.5, r: 2 }],
    ['path', { d: 'M6.6 13.5a3.9 3.9 0 0 1 3.9-3.9', strokeOpacity: 0.55 }],
    'M18.5 2.8c.25 1.6 1.1 2.45 2.7 2.7-1.6.25-2.45 1.1-2.7 2.7-.25-1.6-1.1-2.45-2.7-2.7 1.6-.25 2.45-1.1 2.7-2.7z',
  ],
  upload: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15'],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15'],
  check: [RING, 'M8.5 12.3l2.4 2.4 4.6-5'],
  cloud: [CLOUD],
  queue: ['M4 6h16', 'M4 11h16', 'M4 16h8', ['path', { d: 'M15.5 14v6l5-3z', ...fill }]],
  lyrics: ['M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M8 9h8', 'M8 12h5'],
  volume: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
  mute: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  heart: [HEART],
  heartF: [solid(HEART)],
  more: [dot(5.5, 12), dot(12, 12), dot(18.5, 12)],
  chevD: ['M6 9.5l6 6 6-6'],
  chevL: ['M14.5 6l-6 6 6 6'],
  chevR: ['M9.5 6l6 6-6 6'],
  chevU: ['M6 14.5l6-6 6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  clock: [RING, 'M12 7.5V12l3 2'],
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
  refresh: REFRESH,
  bell: [BELL, BELL_CLAPPER],
  bellF: [solid(BELL), BELL_CLAPPER],
  ext: ['M13.5 5.5h5v5', 'M18.5 5.5 11 13', 'M17 13.5v4a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4'],
  eye: [EYE, ['circle', { cx: 12, cy: 12, r: 2.6 }]],
  /** Settings: 8-tooth cog */
  gear: [GEAR, ['circle', { cx: 12, cy: 12, r: 2.8 }]],
  alert: [RING, 'M12 7.8v5', 'M12 16.2h.01'],
  /** DJ (step 22): horizon, two arcs, the dot */
  dj: [['path', { d: 'M2 16.5h20', strokeOpacity: 0.45 }], 'M7.5 16.5a4.5 4.5 0 0 1 9 0', 'M3.5 16.5a8.5 8.5 0 0 1 17 0', ['circle', { cx: 12, cy: 16.5, r: 1.7, ...fill }]],
  /** Radio (step 26): a station ring, its centre, the satellite */
  radio: RADIO,
  /** Save as playlist (step 26): a list with a plus */
  saveList: ['M4 6h11', 'M4 11h11', 'M4 16h7', 'M17.5 13v7', 'M14 16.5h7'],
  /** ✦ (step 26 smart playlists shelf) */
  spark: [SPARK],

  /* ── drawn for features added after the handoff, in the same hand ── */
  repeatOne: [...REPEAT, 'M11.2 10.4l1.3-.9v5'],
  moreH: [dot(5.5, 12), dot(12, 12), dot(18.5, 12)],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  forward: ARROW_R,
  arrowR: ARROW_R,
  dragHandle: ['M5 10h14', 'M5 14h14'],
  reorder: ['M4 8h15', 'M15.5 4.5 19 8l-3.5 3.5', 'M20 16H5', 'M8.5 12.5 5 16l3.5 3.5'],
  nowPlaying: [['circle', { cx: 12, cy: 12, r: 6.5 }], dot(12, 12, 2.2), 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3'],
  timeline: ['M4 6.5h9', 'M8 12h12', 'M6 17.5h9'],
  radar: [RING, ['circle', { cx: 12, cy: 12, r: 4.5, strokeOpacity: 0.5 }], 'M12 12l5.5-5.5', dot(12, 12, 1.3)],
  upcoming: [...CAL, 'M9.5 15h5', 'M12.5 13l2 2-2 2'],
  fiber_new: [['rect', { x: 3.5, y: 6.5, width: 17, height: 11, rx: 3 }], 'M12 9.2c.2 1.5 1.3 2.6 2.8 2.8-1.5.2-2.6 1.3-2.8 2.8-.2-1.5-1.3-2.6-2.8-2.8 1.5-.2 2.6-1.3 2.8-2.8z'],
  notifActive: [BELL, BELL_CLAPPER, 'M3.5 9a8 8 0 0 1 2.4-4.6', 'M20.5 9a8 8 0 0 0-2.4-4.6'],
  notifActiveF: [solid(BELL), BELL_CLAPPER, 'M3.5 9a8 8 0 0 1 2.4-4.6', 'M20.5 9a8 8 0 0 0-2.4-4.6'],
  album: DISC,
  artist: [['circle', { cx: 12, cy: 8.5, r: 3.5 }], 'M5 20c.6-3.6 3.5-6 7-6s6.4 2.4 7 6'],
  song: [['circle', { cx: 8.5, cy: 17, r: 2.5 }], 'M11 17V4.5', 'M11 4.5c2.2.5 4.6 1.8 5.5 4.3'],
  sort: ['M4 7h16', 'M4 12h11', 'M4 17h6'],
  tune: ['M4 7.5h9', 'M17 7.5h3', ['circle', { cx: 15, cy: 7.5, r: 2 }], 'M4 16.5h3', 'M11 16.5h9', ['circle', { cx: 9, cy: 16.5, r: 2 }]],
  done: [CHECK],
  downloaded: ['M5.5 19.5h13', 'M6.5 11.5l3.8 3.8L18 7.5'],
  offlinePin: [RING, 'M8 16h8', 'M8.6 10.6l2.3 2.3 4.4-4.5'],
  edit: ['M5 19l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L9 18z', 'M13.5 7.5l3 3'],
  delete: ['M5 7h14', 'M10 4.5h4', 'M7 7l.8 11.5a1.5 1.5 0 0 0 1.5 1.5h5.4a1.5 1.5 0 0 0 1.5-1.5L17 7', 'M10.5 10.5v6', 'M13.5 10.5v6'],
  playNext: ['M4 6h9', 'M4 11h9', 'M4 16h6', 'M17.5 20V7.5', 'M14.5 10.5l3-3 3 3'],
  addQueue: [['rect', { x: 3.5, y: 5, width: 17, height: 11, rx: 2 }], 'M9 20h6', 'M12 8v5', 'M9.5 10.5h5'],
  folder: [FOLDER, 'M3.5 11h17'],
  folderClosed: [FOLDER],
  folderOff: [FOLDER, 'M3 3l18 18'],
  logout: ['M10 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h4', 'M10 12h10', 'M16.5 8.5 20 12l-3.5 3.5'],
  account: [RING, ['circle', { cx: 12, cy: 10, r: 3 }], 'M6.6 18.2c1.2-2 3.1-3.2 5.4-3.2s4.2 1.2 5.4 3.2'],
  install: [['rect', { x: 3.5, y: 4.5, width: 17, height: 12, rx: 1.5 }], 'M9 20h6', 'M12 7.5v6', 'M9.5 11l2.5 2.5 2.5-2.5'],
  update: [['rect', { x: 7, y: 3, width: 10, height: 18, rx: 2 }], 'M12 8v6', 'M9.5 11.5 12 14l2.5-2.5'],
  postponed: [...REFRESH, 'M12 8v4l2.5 1.5'],
  bookmark: [BOOKMARK, 'M12 7.5v5', 'M9.5 10h5'],
  bookmarked: [BOOKMARK, 'M9.3 10.2l1.9 1.9 3.5-3.6'],
  wish: [BOOKMARK, 'M12 7.5v5', 'M9.5 10h5'],
  wished: [BOOKMARK, 'M9.3 10.2l1.9 1.9 3.5-3.6'],
  wifi: ['M4 9.5a11.5 11.5 0 0 1 16 0', 'M7 12.8a7.2 7.2 0 0 1 10 0', 'M9.8 16a3 3 0 0 1 4.4 0', dot(12, 19)],
  storage: [['rect', { x: 4, y: 4.5, width: 16, height: 6, rx: 1.5 }], ['rect', { x: 4, y: 13.5, width: 16, height: 6, rx: 1.5 }], dot(7.5, 7.5, 0.9), dot(7.5, 16.5, 0.9)],
  sdStorage: ['M9 3.5h8.5A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V7.5z', 'M10 7v2.5', 'M13 7v2.5', 'M16 7v2.5'],
  keyboard: [['rect', { x: 3, y: 6, width: 18, height: 12, rx: 2 }], 'M7 10h.01', 'M10.3 10h.01', 'M13.7 10h.01', 'M17 10h.01', 'M8 14.5h8'],
  stats: ['M6 19v-8', 'M12 19V5', 'M18 19v-6'],
  health: ['M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z', 'M12 9v6', 'M9 12h6'],
  mic: [['rect', { x: 9, y: 3.5, width: 6, height: 11, rx: 3 }], 'M6 11.5a6 6 0 0 0 12 0', 'M12 17.5v3'],
  info: [RING, 'M12 11v5', 'M12 7.8h.01'],
  unfold: ['M8 9.5l4-4 4 4', 'M8 14.5l4 4 4-4'],
  today: [...CAL, ['rect', { x: 7.5, y: 13, width: 3.5, height: 3.5, rx: 0.6 }]],
  calendar: [...CAL, 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 17h.01', 'M12 17h.01'],
  event: [...CAL, ['rect', { x: 13, y: 13.5, width: 3.5, height: 3.5, rx: 0.6 }]],
  editCalendar: [...CAL, 'M12.5 18.5l.4-1.6 3.6-3.6a1 1 0 0 1 1.4 1.4l-3.6 3.6z'],
  eventRepeat: [...CAL, 'M15 15.5a3 3 0 1 1-.9-2.1', 'M15 12.6v1.6h-1.6'],
  eventBusy: [...CAL, 'M10 13l4 4', 'M14 13l-4 4'],
  explore: [RING, 'M15.5 8.5l-2 5-5 2 2-5z'],
  history: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4.5 4.5v3.2h3.2', 'M12 8v4l2.5 1.5'],
  lock: LOCK,
  lockClock: [...LOCK, 'M12 13.5v3'],
  autorenew: LOOP,
  sync: LOOP,
  sensors: RADIO,
  searchOff: [['circle', { cx: 11, cy: 11, r: 6.5 }], 'M20 20l-4.3-4.3', 'M8.8 8.8l4.4 4.4', 'M13.2 8.8l-4.4 4.4'],
  checkCircle: [RING, 'M8.5 12.3l2.4 2.4 4.6-5'],
  arrowDrop: [['path', { d: 'M8 10l4 4.5 4-4.5z', ...fill }]],
  following: [...PERSON, 'M15 18l2 2 4-4.5'],
  person_add: [...PERSON, 'M18 7v6', 'M15 10h6'],
  timer: [['circle', { cx: 12, cy: 13.5, r: 7 }], 'M12 13.5V10', 'M10 3.5h4', 'M18 7.5l1.3-1.3'],
  filter: ['M4 7h16', 'M7 12h10', 'M10 17h4'],
  label: ['M4 12.2V5.5A1.5 1.5 0 0 1 5.5 4h6.7l8 8a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z', ['circle', { cx: 8.5, cy: 8.5, r: 1.3 }]],
  podcasts: [dot(12, 12, 1.6), 'M8.5 15.5a5 5 0 1 1 7 0', 'M5.6 18.4a9 9 0 1 1 12.8 0'],
  stopCircle: [RING, ['rect', { x: 9, y: 9, width: 6, height: 6, rx: 1 }]],
  uploadFile: ['M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z', 'M14 3.5v4h4', 'M12 17v-6', 'M9.5 13.5 12 11l2.5 2.5'],
  imageOff: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }], 'M4 16l4.5-4.5 3 3', 'M3 3l18 18'],
  block: [RING, 'M6 18L18 6'],
  hide: [EYE, ['circle', { cx: 12, cy: 12, r: 2.6 }], 'M4 4l16 16'],
  share: [['circle', { cx: 17, cy: 6, r: 2.3 }], ['circle', { cx: 7, cy: 12, r: 2.3 }], ['circle', { cx: 17, cy: 18, r: 2.3 }], 'M9 11l6-3.8', 'M9 13l6 3.8'],
  thumbDown: ['M9 14.5H5.5A1.5 1.5 0 0 1 4 13V6.5A1.5 1.5 0 0 1 5.5 5H9', 'M9 5h8a1.5 1.5 0 0 1 1.5 1.3l1 6.5a1.5 1.5 0 0 1-1.5 1.7H14v3.5a2 2 0 0 1-2 2l-3-6z'],
  warning: ['M10.7 4.8a1.5 1.5 0 0 1 2.6 0l7.4 12.8a1.5 1.5 0 0 1-1.3 2.2H4.6a1.5 1.5 0 0 1-1.3-2.2z', 'M12 9.5V14', 'M12 16.8h.01'],
  palette: ['M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.6 1.6-2.6h1.8a3.7 3.7 0 0 0 3.7-3.7C20.5 7.6 16.7 3.5 12 3.5z', dot(8, 11, 1), dot(10.5, 7.5, 1), dot(15, 7.8, 1)],
  recordVoiceOver: [['circle', { cx: 9, cy: 9, r: 3.5 }], 'M3 20c.6-3.4 3.1-5.5 6-5.5s5.4 2.1 6 5.5', 'M16.5 6.5a4 4 0 0 1 0 5', 'M19 4a7.5 7.5 0 0 1 0 10'],
  psychology: ['M14 20.5v-3h2.5a1.5 1.5 0 0 0 1.5-1.5v-2.5l1.6-.6a.6.6 0 0 0 .3-.9L18 9.5A6.5 6.5 0 1 0 8 15.4v5.1', 'M10.5 10.5a1.8 1.8 0 1 1 2.6 1.6'],
  graphicEq: ['M4 10v4', 'M8 7v10', 'M12 4v16', 'M16 7v10', 'M20 10v4'],
  highQuality: [['rect', { x: 3.5, y: 6, width: 17, height: 12, rx: 2 }], 'M7.5 9.5v5', 'M10.5 9.5v5', 'M7.5 12h3', ['circle', { cx: 15, cy: 12, r: 2.2 }], 'M16.2 13.4l1.3 1.3'],
  cloudDownload: [CLOUD, 'M12 10v5.5', 'M9.8 13.3 12 15.5l2.2-2.2'],
  deleteSweep: ['M4 7h9', 'M7 4.5h3', 'M5 7l.7 10.5a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L13 7', 'M16 9.5h4.5', 'M16 13h3.5', 'M16 16.5h2.5'],
  /* concerts */
  concerts: [TICKET, 'M12 9.3l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z'],
  ticket: [TICKET, 'M14.5 8v1', 'M14.5 11.5v1', 'M14.5 15v1'],
  key: [['circle', { cx: 8, cy: 15, r: 4 }], 'M10.8 12.2 19 4', 'M16 7l2.5 2.5', 'M14 9l2 2'],
  location: [PIN, ['circle', { cx: 12, cy: 10, r: 2.3 }]],
  city: ['M4 20.5h16', 'M5.5 20.5V9l5-3v14.5', 'M10.5 20.5V4l8 3.5v13', 'M13.5 10h.01', 'M16 10h.01', 'M13.5 13.5h.01', 'M16 13.5h.01', 'M13.5 17h.01', 'M16 17h.01'],
  festival: ['M12 4.5c-1.5 3.8-5 6.6-8.5 7.5h17C17 11.1 13.5 8.3 12 4.5z', 'M12 4.5V2.5', 'M5 12v8.5', 'M19 12v8.5', 'M10 20.5c0-2 .8-3.4 2-4.5 1.2 1.1 2 2.5 2 4.5', 'M3.5 20.5h17'],
  globe: [RING, 'M12 3.5c-2.5 2.3-3.8 5.2-3.8 8.5s1.3 6.2 3.8 8.5c2.5-2.3 3.8-5.2 3.8-8.5S14.5 5.8 12 3.5z', 'M3.5 12h17'],
  stadium: ['M3.5 9c0-1.9 3.8-3.5 8.5-3.5s8.5 1.6 8.5 3.5-3.8 3.5-8.5 3.5S3.5 10.9 3.5 9z', 'M3.5 9v6c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V9', 'M12 12.5v6'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  /* player sync (step 37) */
  devices: [['rect', { x: 3, y: 5, width: 13, height: 9.5, rx: 1.5 }], 'M6 18h7', ['rect', { x: 16.5, y: 9, width: 4.5, height: 10, rx: 1.2 }]],
  computer: [['rect', { x: 3.5, y: 5, width: 17, height: 11, rx: 1.5 }], 'M8.5 19.5h7', 'M12 16v3.5'],
  smartphone: [['rect', { x: 7, y: 3, width: 10, height: 18, rx: 2 }], 'M11 18h2'],
  speaker: [['rect', { x: 6, y: 3, width: 12, height: 18, rx: 2 }], ['circle', { cx: 12, cy: 14, r: 3.2 }], dot(12, 7.5, 0.9)],
} satisfies Record<string, Shape[]>

/** Solid variants, drawn for `filled` (liked, saved, the active state of a few toggles). */
const FILLED: Partial<Record<keyof typeof ICON_PATHS, Shape[]>> = {
  heart: [solid(HEART)],
  bell: [solid(BELL), BELL_CLAPPER],
  notifActive: [solid(BELL), BELL_CLAPPER, 'M3.5 9a8 8 0 0 1 2.4-4.6', 'M20.5 9a8 8 0 0 0-2.4-4.6'],
  spark: [solid(SPARK)],
  bookmark: [solid(BOOKMARK)],
  bookmarked: [solid(BOOKMARK), knock('M9.3 10.2l1.9 1.9 3.5-3.6')],
  wish: [solid(BOOKMARK)],
  wished: [solid(BOOKMARK), knock('M9.3 10.2l1.9 1.9 3.5-3.6')],
  location: [solid(PIN), ['circle', { cx: 12, cy: 10, r: 2.3, fill: 'var(--bg-1, #0B0B0C)', stroke: 'none' }]],
  checkCircle: [['circle', { cx: 12, cy: 12, r: 8.5, fill: 'currentColor' }], knock('M8.5 12.3l2.4 2.4 4.6-5')],
  check: [['circle', { cx: 12, cy: 12, r: 8.5, fill: 'currentColor' }], knock('M8.5 12.3l2.4 2.4 4.6-5')],
}

export type IconName = keyof typeof ICON_PATHS
export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[]

export interface IconProps {
  name: IconName
  /** px or CSS length; defaults to 1em (the stylesheets size icons through `.x .ms { font-size }`) */
  size?: number | string
  className?: string
  style?: CSSProperties
  /** solid variant, where the icon has one (heart, bell, bookmark, location, spark, check circle) */
  filled?: boolean
  /** accessible label; omit for decorative icons */
  title?: string
}

export function Icon({ name, size, className, style, filled, title }: IconProps) {
  const shapes: Shape[] = (filled && FILLED[name]) || ICON_PATHS[name]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={'ms' + (className ? ' ' + className : '')}
      style={size !== undefined ? { fontSize: size, ...style } : style}
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
