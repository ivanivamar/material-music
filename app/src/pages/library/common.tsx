/** Pieces shared by the Library, Album, Artist, Search and New releases pages. */
import { useState, type ReactNode } from 'react'
import { Icon } from '../../design/icons'
import { back } from '../../shell/routes'
import { useCover, useLazyCover } from '../../lib/covers'
import { type Artist } from '../../state/library'
import { monogram } from '../../state/views'

/* ── Artist avatar: photo (grey until hover) or mono monogram ── */

export function ArtistAvatar({ artist, size, lazy = true, className }: { artist: Artist; size: number | string; lazy?: boolean; className?: string }) {
  const [ref, lazyUrl] = useLazyCover<HTMLDivElement>(lazy ? artist.image?.id : null, artist.image?.v)
  const eager = useCover(lazy ? null : artist.image?.id, artist.image?.v)
  const url = lazy ? lazyUrl : eager
  const [failed, setFailed] = useState(false)
  const px = typeof size === 'number' ? size : null
  return (
    <div ref={ref} className={['avatar-art', className].filter(Boolean).join(' ')} style={{ width: size, height: size }}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <>
          <span className="avatar-art-line" aria-hidden />
          <span className="avatar-art-mono" style={px ? { fontSize: Math.round(px * 0.245) } : undefined}>
            {monogram(artist.name)}
          </span>
        </>
      )}
    </div>
  )
}


/* ── Breadcrumb: ‹ LIBRARY / ALBUMS ─────────────────── */

export function Crumbs({ fallback, parts }: { fallback: string; parts: ReactNode[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <button type="button" className="crumbs-back" onClick={() => back(fallback)} aria-label="Back">
        <Icon name="chevL" />
      </button>
      {parts.map((p, i) => (
        <span key={i} className="crumbs-part">
          {i > 0 && <span className="crumbs-sep">/</span>}
          {p}
        </span>
      ))}
    </nav>
  )
}

/* ── Section head: LABEL ──────────── 01 ─────────── */

export function SectionHead({ label, right, size = 'md' }: { label: ReactNode; right?: ReactNode; size?: 'md' | 'sm' }) {
  return (
    <div className={`sect-head ${size === 'sm' ? 'sect-head-sm' : ''}`}>
      <span className="sect-label">{label}</span>
      <span className="sect-line" />
      {right != null && <span className="sect-right">{right}</span>}
    </div>
  )
}
