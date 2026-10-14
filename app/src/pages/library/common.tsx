/** Pieces shared by the Library, Album and Artist pages. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlbumCard } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useCover, useLazyCover } from '../../lib/covers'
import { type Album, type Artist, type Catalogue } from '../../state/library'
import { albumHref, back, go } from '../../shell/routes'
import { monogram } from '../../state/views'
import { albumTrackIds, playList } from './playback'
import { albumOffline, useDownloads, useOnline } from '../../state/downloads'

/* ── Album card with a lazy cover ─────────────────── */

export function LibAlbumCard({ c, album, subtitle, playingAlbumId, onOpen }: { c: Catalogue; album: Album; subtitle: ReactNode; playingAlbumId?: string | null; onOpen?: () => void }) {
  const [ref, cover] = useLazyCover<HTMLDivElement>(album.cover)
  const dl = useDownloads()
  const online = useOnline()
  const off = dl.available ? albumOffline(dl, album.id) : null
  return (
    <AlbumCard
      offline={!!off?.complete}
      unavailable={!!off && !online && off.done === 0}
      cardRef={ref}
      title={album.title}
      subtitle={subtitle}
      cover={cover ?? undefined}
      playing={playingAlbumId === album.id}
      onOpen={() => {
        onOpen?.()
        go(albumHref(album.id))
      }}
      onPlay={() => {
        onOpen?.()
        playList(albumTrackIds(c, album.id), { kind: 'album', id: album.id, label: album.title })
      }}
    />
  )
}

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

/* ── Sort menu: "SORT · RECENTLY ADDED ▾" ──────────── */

export function SortMenu<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <div className="sort" ref={wrap}>
      <button type="button" className="sort-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        SORT · {current.label.toUpperCase()}
        <span className="sort-chev">
          <Icon name="chevD" />
        </span>
      </button>
      {open && (
        <div className="menu sort-menu" role="menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              className="menu-item"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <span className="mi-ic">{o.value === value ? <Icon name="check" /> : null}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
