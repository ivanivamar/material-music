/** Artist avatar shared by the Library, Artist, Search and New releases pages. */
import { useState } from 'react'
import { useCover, useLazyCover } from '../../lib/covers'
import { type Artist } from '../../state/library'
import { monogram } from '../../state/views'
import './avatar.css'

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

