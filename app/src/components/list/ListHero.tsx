/**
 * Header of a list page (album, playlist, Liked songs, mix): art, a mono kicker, the title, a line
 * under it (artist link, description), mono stats and extras (smart rules), then one row of buttons
 * with an optional right-hand part (offline switch, "sorted by").
 *
 * Desktop: 220px art beside the text, the buttons under both.
 * Phone: `stack` puts a 200px cover over the text (albums); `side` keeps a 120px art beside a
 * shorter title (playlists, mixes). The buttons fill the width.
 * Scrolling collapses it into a compact bar at the top (CompactBar.tsx).
 */
import { useRef, type CSSProperties, type ReactNode } from 'react'
import { CompactBar, useCollapsingHeader } from './CompactBar'

/** Title size steps down for long titles so they stay on ≤ 2 lines. */
function titleSize(t: string, phone: boolean, max = 72): number {
  if (phone) return t.length <= 16 ? 30 : t.length <= 30 ? 26 : 22
  const k = max / 72
  return Math.round((t.length <= 16 ? 72 : t.length <= 28 ? 56 : t.length <= 44 ? 44 : 36) * k)
}

export function ListHero({
  art,
  kicker,
  title,
  titleText,
  onTitleDoubleClick,
  line,
  stats,
  extra,
  buttons,
  aside,
  phone,
  layout = 'side',
  titleMax,
  className,
}: {
  art: ReactNode
  kicker?: ReactNode
  title: ReactNode
  /** plain text of the title (size + tooltip) */
  titleText: string
  onTitleDoubleClick?: () => void
  line?: ReactNode
  stats?: ReactNode
  extra?: ReactNode
  buttons: ReactNode
  aside?: ReactNode
  phone: boolean
  layout?: 'stack' | 'side'
  /** desktop title size for short titles (design: album 104, playlist 92); longer titles step down in proportion */
  titleMax?: number
  className?: string
}) {
  const heroRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  useCollapsingHeader(heroRef, barRef, { art: '.lh-art', text: '.lh-text', title: '.lh-title' }, [phone, layout])
  return (
    <>
      <CompactBar barRef={barRef} art={art} title={titleText} />
      <header ref={heroRef} className={`lh ${phone ? `is-phone is-${layout}` : ''} ${className ?? ''}`}>
        <div className="lh-art">{art}</div>
        <div className="lh-text">
          {kicker != null && <div className="lh-kicker">{kicker}</div>}
          <h1 className="lh-title" style={{ '--ts': `${titleSize(titleText, phone, titleMax)}px` } as CSSProperties} title={titleText} onDoubleClick={onTitleDoubleClick}>
            {title}
          </h1>
          {line != null && <div className="lh-line">{line}</div>}
          {stats != null && <div className="lh-stats">{stats}</div>}
          {!phone && extra}
        </div>
      </header>
      {phone && extra}
      <div className={`lh-btns ${phone ? 'is-phone' : ''}`}>
        {buttons}
        {aside != null && (
          <>
            <span className="lh-flex" />
            <div className="lh-aside">{aside}</div>
          </>
        )}
      </div>
    </>
  )
}
