/**
 * The heart (Liked songs, Nov 2026): on every song row and in the players.
 *
 * Off: an outlined heart in the row's grey. On: a filled lilac heart (--like, the DJ's lilac).
 * Liking: the heart settles in and two thin rings ping out of it, the same rings and timing as the
 * play button (shorter reach in song rows). Unliking: a quick dip. Reduced motion (the app's Motion
 * setting / the system's): neither. (Until Nov 16 2026: a rose heart with a fountain of small hearts.)
 */
import { isPreviewId } from '../state/previews'
import { useState, type MouseEvent } from 'react'
import { Icon } from '../design/icons'
import { setLike } from '../actions/ops'
import { useToast } from './ui'
import { useIsLiked } from '../state/likes'
import { useMotion } from '../state/motion'

export type LikeSize = 'xs' | 'sm' | 'md' | 'lg'

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
  // bumps on every press so the icon (and the rings) re-mount and replay
  const [press, setPress] = useState<{ n: number; on: boolean }>({ n: 0, on: false })

  const click = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (disabled) return
    const next = !liked
    onToggle(next)
    if (motion) setPress((p) => ({ n: p.n + 1, on: next }))
  }

  const name = label ?? (liked ? 'Remove from Liked songs' : 'Add to Liked songs')
  const cls = ['like', `like-${size}`, liked && 'is-on', ink && 'is-ink', hover && 'is-hover', className].filter(Boolean).join(' ')
  const anim = press.n && press.on === liked ? (liked ? 'is-pop' : 'is-unpop') : ''
  return (
    // pointerdown stays here: rows start a touch drag / long-press on it
    <button type="button" className={cls} aria-pressed={liked} aria-label={name} title={name} disabled={disabled} onClick={click} onPointerDown={(e) => e.stopPropagation()}>
      <span key={press.n} className={`like-ic ${anim}`}>
        <Icon name="heart" filled={liked} />
      </span>
      {anim === 'is-pop' && (
        <span className="like-pings" key={`p${press.n}`} aria-hidden>
          <span className="like-ring" />
          <span className="like-ring like-ring2" />
        </span>
      )}
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
  // a Discovery preview isn't in the library: no heart
  if (isPreviewId(trackId)) return null
  return <HeartButton {...look} liked={liked} disabled={!trackId} onToggle={(next) => trackId && setLike(toast, trackId, next, { quiet: true })} />
}
