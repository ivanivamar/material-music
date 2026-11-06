/**
 * The heart (Liked songs, Nov 2026): on every song row and in the players.
 *
 * Off: an outlined heart in the row's grey. On: a filled rose heart. Liking pops the heart and
 * throws a fountain of small hearts up out of its top: they rise, spread, tumble and fall back
 * while fading. The fountain is drawn in a fixed layer on <body> (portal) at the button's position,
 * so rows with overflow: hidden, virtual lists and the full-screen player never clip it.
 * Reduced motion (the app's Motion setting / the system's): no fountain, no pop.
 */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../design/icons'
import { setLike } from '../actions/ops'
import { useToast } from './ui'
import { useIsLiked } from '../state/likes'
import { useMotion } from '../state/motion'
import './like.css'

export type LikeSize = 'xs' | 'sm' | 'md' | 'lg'

/** Material "favorite", for the small fountain hearts (no font needed). */
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

const SCALE: Record<LikeSize, number> = { xs: 0.75, sm: 0.85, md: 1, lg: 1.25 }
const TINTS = ['var(--like)', 'var(--like-hi)', 'var(--brand)', 'var(--like)', 'oklch(0.9 0.06 12)']

interface Drop {
  dx: number
  h: number
  fall: number
  s: number
  r: number
  d: number
  t: number
  c: string
}

/** One burst: 9 hearts, fanned out from the centre so it reads as a fountain, not a spray. */
function makeDrops(scale: number): Drop[] {
  const n = 9
  return Array.from({ length: n }, (_, i) => {
    const lane = (i / (n - 1)) * 2 - 1 // -1 … 1
    const jitter = (Math.random() - 0.5) * 0.35
    const spread = (lane + jitter) * 30 * scale
    return {
      dx: spread,
      // centre lanes shoot highest
      h: (34 + (1 - Math.abs(lane)) * 26 + Math.random() * 12) * scale,
      fall: (14 + Math.random() * 16) * scale,
      s: 0.4 + Math.random() * 0.38,
      r: lane * 38 + (Math.random() - 0.5) * 30,
      d: Math.round(Math.random() * 110),
      t: Math.round(720 + Math.random() * 260),
      c: TINTS[i % TINTS.length],
    }
  })
}

function Fountain({ at, scale, onDone }: { at: { x: number; y: number }; scale: number; onDone: () => void }) {
  const [drops] = useState(() => makeDrops(scale))
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    const longest = Math.max(...drops.map((d) => d.d + d.t))
    const id = window.setTimeout(() => done.current(), longest + 60)
    return () => window.clearTimeout(id)
  }, [drops])
  return createPortal(
    <div className="like-fountain" style={{ left: at.x, top: at.y }} aria-hidden>
      {drops.map((d, i) => (
        <span
          key={i}
          className="like-drop"
          style={{ '--lk-dx': `${d.dx}px`, '--lk-h': `${-d.h}px`, '--lk-fall': `${d.fall - d.h}px`, '--lk-s': d.s, '--lk-r': `${d.r}deg`, '--lk-d': `${d.d}ms`, '--lk-t': `${d.t}ms`, color: d.c } as CSSProperties}
        >
          <span className="like-drop-y">
            <svg viewBox="0 0 24 24" width={14 * scale} height={14 * scale}>
              <path d={HEART} fill="currentColor" />
            </svg>
          </span>
        </span>
      ))}
    </div>,
    document.body,
  )
}

interface HeartLook {
  /** xs 28 (dense rows) · sm 32 (rows) · md 40 (player bar, mini-player) · lg 48 (full-screen player) */
  size?: LikeSize
  className?: string
  /** off-state colour follows the surrounding text (player surfaces) instead of the grey */
  ink?: boolean
  /** in a row: an un-liked heart only shows while the row (`.like-host`) is hovered (desktop mouse) */
  hover?: boolean
}

/** The heart itself, controlled: pop + fountain when it turns on. LikeButton binds it to Liked songs. */
export function HeartButton({ liked, onToggle, disabled, size = 'sm', className, ink, hover, label }: HeartLook & { liked: boolean; onToggle: (next: boolean) => void; disabled?: boolean; label?: string }) {
  const motion = useMotion()
  const ref = useRef<HTMLButtonElement>(null)
  const [burst, setBurst] = useState<{ key: number; x: number; y: number } | null>(null)
  const [pop, setPop] = useState(0)

  const click = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (disabled) return
    const next = !liked
    onToggle(next)
    if (!next || !motion) return
    setPop((n) => n + 1)
    const r = ref.current?.getBoundingClientRect()
    // from the top of the heart glyph (a little below the button's own top edge)
    if (r) setBurst({ key: Date.now(), x: r.left + r.width / 2, y: r.top + r.height * 0.3 })
  }

  const name = label ?? (liked ? 'Remove from Liked songs' : 'Add to Liked songs')
  const cls = ['like', `like-${size}`, liked && 'is-on', ink && 'is-ink', hover && 'is-hover', className].filter(Boolean).join(' ')
  return (
    // pointerdown stays here: rows start a touch drag / long-press on it
    <button ref={ref} type="button" className={cls} aria-pressed={liked} aria-label={name} title={name} disabled={disabled} onClick={click} onPointerDown={(e) => e.stopPropagation()}>
      <span key={pop} className={`like-ic ${pop && liked ? 'is-pop' : ''}`}>
        <Icon name="heart" filled={liked} />
      </span>
      {burst && <Fountain key={burst.key} at={burst} scale={SCALE[size]} onDone={() => setBurst(null)} />}
    </button>
  )
}

export interface LikeButtonProps extends HeartLook {
  trackId: string | null | undefined
}

/** A song's heart: lit when the song is in Liked songs; a click likes / unlikes it (Undo toast on unlike). */
export function LikeButton({ trackId, ...look }: LikeButtonProps) {
  const liked = useIsLiked(trackId)
  const toast = useToast()
  return <HeartButton {...look} liked={liked} disabled={!trackId} onToggle={(next) => trackId && setLike(toast, trackId, next, { quiet: true })} />
}
