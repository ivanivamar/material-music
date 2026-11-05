/**
 * Badge — a small static label (not a button): "Radio", "DJ", "On Kitchen speaker", "Played",
 * "Album", "On tour"… Replaces the per-page copies (.pb-chip / .mini-chip, .np-chip, .dj-chip,
 * .sr-top-chip, .hx-radio-chip, .ot-hero-chip, .qp-played-tag).
 *   tone: neutral (raised surface) · tonal (coral container) · brand · album (follows --h) ·
 *         album-container · dj · dj-container · success · warn · danger · on-media (over cover art) ·
 *         outlined (edge only) · subtle (faint, e.g. "Played" in the queue)
 *   size: sm 20px (inline in rows / bars) · md 24px · lg 28px (on cards / hero art)
 * For interactive pills use Chip or Button instead.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'

export type BadgeTone = 'neutral' | 'tonal' | 'brand' | 'album' | 'album-container' | 'dj' | 'dj-container' | 'success' | 'warn' | 'danger' | 'on-media' | 'outlined' | 'subtle'

/** Class list for a badge, for the odd element that must be a button (Concerts status → edit). */
export const badgeClass = (tone: BadgeTone = 'neutral', size: 'sm' | 'md' | 'lg' = 'md', extra?: string) => ['bdg', `bdg-${tone}`, `bdg-${size}`, extra].filter(Boolean).join(' ')

export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  icon,
  title,
  className,
  style,
}: {
  children: ReactNode
  tone?: BadgeTone
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  title?: string
  className?: string
  /** e.g. { '--h': hue } for tone="album" outside a .hue-scope */
  style?: CSSProperties
}) {
  return (
    <span className={badgeClass(tone, size, className)} title={title} style={style}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  )
}
