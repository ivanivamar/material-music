/**
 * Material Music icons: Material Symbols Rounded (self-hosted variable font, FILL axis), opsz 24 / wght 400
 * as in the Material redesign handoff. The app keeps its own short icon names; each maps to a symbol.
 * Names ending in F (playF, pauseF, heartF, bellF) and `filled` render the filled variant.
 * The DJ mark is not a symbol: it stays a small drawn burst (DJ identity, violet).
 */
import type { CSSProperties } from 'react'

export const ICON_SYMBOLS = {
  playF: 'play_arrow',
  pauseF: 'pause',
  prev: 'skip_previous',
  next: 'skip_next',
  shuffle: 'shuffle',
  repeat: 'repeat',
  repeatOne: 'repeat_one',
  home: 'home',
  library: 'library_music',
  search: 'search',
  newr: 'new_releases',
  upload: 'upload',
  download: 'download',
  check: 'check_circle',
  cloud: 'cloud',
  queue: 'queue_music',
  lyrics: 'lyrics',
  volume: 'volume_up',
  mute: 'volume_off',
  heart: 'favorite',
  heartF: 'favorite',
  more: 'more_vert',
  moreH: 'more_horiz',
  chevD: 'expand_more',
  chevL: 'chevron_left',
  chevR: 'chevron_right',
  chevU: 'expand_less',
  back: 'arrow_back',
  forward: 'arrow_forward',
  plus: 'add',
  clock: 'schedule',
  smart: 'auto_awesome',
  playlist: 'queue_music',
  offline: 'cloud_off',
  x: 'close',
  drag: 'drag_indicator',
  grid: 'grid_view',
  timeline: 'view_timeline',
  refresh: 'refresh',
  radar: 'radar',
  upcoming: 'event_upcoming',
  fiber_new: 'fiber_new',
  bell: 'notifications',
  bellF: 'notifications',
  notifActive: 'notifications_active',
  notifActiveF: 'notifications_active',
  ext: 'open_in_new',
  eye: 'visibility',
  gear: 'settings',
  alert: 'error',
  radio: 'sensors',
  saveList: 'playlist_add',
  spark: 'auto_awesome',
  album: 'album',
  artist: 'person',
  song: 'music_note',
  sort: 'sort',
  tune: 'tune',
  done: 'check',
  downloaded: 'download_done',
  offlinePin: 'offline_pin',
  edit: 'edit',
  delete: 'delete',
  playNext: 'queue_play_next',
  addQueue: 'add_to_queue',
  folder: 'folder_open',
  logout: 'logout',
  account: 'account_circle',
  install: 'install_desktop',
  update: 'system_update',
  bookmark: 'bookmark_add',
  bookmarked: 'bookmark_added',
  wifi: 'wifi',
  storage: 'storage',
  keyboard: 'keyboard',
  stats: 'bar_chart',
  health: 'health_and_safety',
  mic: 'mic',
  info: 'info',
  unfold: 'unfold_more',
  today: 'today',
  explore: 'explore',
  history: 'history',
  lock: 'lock',
  autorenew: 'autorenew',
  arrowR: 'arrow_forward',
  sensors: 'sensors',
  searchOff: 'search_off',
  checkCircle: 'check_circle',
  arrowDrop: 'arrow_drop_down',
  following: 'how_to_reg',
  person_add: 'person_add',
  sync: 'sync',
  calendar: 'calendar_month',
  timer: 'timer',
  filter: 'filter_list',
  label: 'sell',
  dj: '',
} as const

export type IconName = keyof typeof ICON_SYMBOLS
export const ICON_NAMES = Object.keys(ICON_SYMBOLS) as IconName[]

const FILLED = new Set<IconName>(['playF', 'pauseF', 'heartF', 'bellF', 'notifActiveF'])

export interface IconProps {
  name: IconName
  /** px; defaults to 1.25em of the surrounding text (Material Symbols sit at 20–24px next to 14–16px text) */
  size?: number | string
  className?: string
  style?: CSSProperties
  /** filled variant (FILL 1), e.g. the selected nav item */
  filled?: boolean
  /** accessible label; omit for decorative icons */
  title?: string
}

/** The DJ burst: 9-sided cookie with a deep amplitude (handoff DJ mark). */
const DJ_PATH = (() => {
  const pts: string[] = []
  for (let i = 0; i < 90; i++) {
    const t = (i / 90) * Math.PI * 2
    const r = 10 * (1 - 0.14 + 0.14 * Math.cos(9 * t))
    pts.push(`${(12 + r * Math.cos(t)).toFixed(2)} ${(12 + r * Math.sin(t)).toFixed(2)}`)
  }
  return 'M' + pts.join('L') + 'Z'
})()

export function Icon({ name, size, className, style, filled, title }: IconProps) {
  const a11y = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const }
  if (name === 'dj') {
    const s = size ?? '1.25em'
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" className={className} style={{ display: 'block', flex: 'none', ...style }} {...a11y}>
        <path d={DJ_PATH} fill="currentColor" />
      </svg>
    )
  }
  const fill = filled || FILLED.has(name)
  return (
    <span
      className={'ms' + (fill ? ' ms-fill' : '') + (className ? ' ' + className : '')}
      style={{ fontSize: size ?? undefined, ...style }}
      {...a11y}
    >
      {ICON_SYMBOLS[name]}
    </span>
  )
}
