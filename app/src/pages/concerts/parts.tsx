/**
 * Concerts building blocks (design_handoff_concerts): artist photo with its hue ring, the calendar
 * date block, status chips, Tickets buttons, the radius segmented control, the home-city search,
 * and the location picker (desktop popover / phone sheet). Artist hue comes from the photo
 * (useArtistHue), else the name; it only tints small things (date block, ring, festival label).
 */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../design/icons'
import { SHAPE_CLOVER } from '../../design/shapes'
import { useCover } from '../../lib/covers'
import { nameHue } from '../../lib/mixing'
import { concertsStore, RADII, searchCities, type City, type Radius } from '../../state/concerts'
import { dateParts, statusLook, type Show } from '../../state/concertViews'
import type { Artist } from '../../state/library'
import { artistHref, go } from '../../shell/routes'
import { initials, useArtistHue } from '../home/art'
import './concerts.css'
import { openExternal } from '../releases/parts'

/* ── Artist look ────────────────────────────────────── */

export function useArtistLook(artist: Artist | undefined): { photo: string | null; H: number } {
  const photo = useCover(artist?.image?.id, artist?.image?.v) ?? null
  const hue = useArtistHue(artist)
  return { photo, H: hue ?? (artist ? nameHue(artist.name) : 38) }
}

export const hueVars = (H: number) => ({ '--H': H }) as CSSProperties

/** Round artist photo with a ring in the surface colour, then one in the artist hue. */
export function ArtistPhoto({ artist, photo, size, grey, className, title }: { artist: Artist | undefined; photo: string | null; size: number; grey?: boolean; className?: string; title?: string }) {
  return (
    <span className={`cx-photo ${grey ? 'is-grey' : ''} ${className ?? ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }} title={title}>
      {photo ? <img src={photo} alt="" draggable={false} /> : <span className="cx-initials">{artist ? initials(artist.name) : '?'}</span>}
    </span>
  )
}

/** Opens the artist page (photo / name taps). */
export const openArtist = (id: string) => (e?: MouseEvent) => {
  e?.stopPropagation()
  go(artistHref(id))
}

/* ── Date block ─────────────────────────────────────── */

export function DateBlock({ show, kind, className }: { show: Pick<Show, 'date' | 'end' | 'status'>; kind: 'poster' | 'poster-sm' | 'row' | 'small' | 'tour'; className?: string }) {
  const p = dateParts(show)
  return (
    <span className={`cx-date is-${kind} ${p.two ? 'is-two' : ''} ${show.status === 'cancelled' ? 'is-cancelled' : ''} ${className ?? ''}`}>
      <span className="cx-date-m">{p.mon}</span>
      <span className="cx-date-d">{p.day}</span>
      <span className="cx-date-w">{p.dow}</span>
    </span>
  )
}

/* ── Status chip ────────────────────────────────────── */

export function StatusChip({ show, size = 'md', solid, onClick, label }: { show: Show; size?: 'sm' | 'md' | 'lg'; solid?: boolean; onClick?: (e: MouseEvent) => void; label?: string }) {
  const look = statusLook(show)
  const body = (
    <>
      <Icon name={look.icon} />
      {label ?? look.label}
    </>
  )
  const cls = `cx-chip is-${show.status} is-${size} ${solid ? 'is-solid' : ''}`
  if (onClick)
    return (
      <button type="button" className={`${cls} is-btn`} onClick={onClick} title="Edit this show">
        {body}
      </button>
    )
  return <span className={cls}>{body}</span>
}

/* ── Tickets ────────────────────────────────────────── */

export function ticketsOf(show: Show): string | null {
  return statusLook(show).tk === 'none' || !show.url ? null : show.url
}

export function TicketsPill({ show, filled, size = 40 }: { show: Show; filled?: boolean; size?: number }) {
  const url = ticketsOf(show)
  if (!url) return null
  const look = statusLook(show)
  return (
    <button
      type="button"
      className={`cx-tk ${filled ? 'is-filled' : look.tk === 'tonal' ? 'is-tonal' : 'is-outlined'}`}
      style={{ height: size }}
      onClick={(e) => {
        e.stopPropagation()
        openExternal(url)
      }}
    >
      Tickets
      <Icon name="ext" />
    </button>
  )
}

export function TicketsIcon({ show, size = 40, plain }: { show: Show; size?: number; plain?: boolean }) {
  const url = ticketsOf(show)
  if (!url) return null
  const look = statusLook(show)
  return (
    <button
      type="button"
      className={`cx-tki ${plain ? 'is-plain' : look.tk === 'tonal' ? 'is-tonal' : 'is-outlined'}`}
      style={{ width: size, height: size }}
      title="Tickets"
      aria-label="Tickets"
      onClick={(e) => {
        e.stopPropagation()
        openExternal(url)
      }}
    >
      <Icon name={plain ? 'ext' : 'concerts'} />
    </button>
  )
}

/* ── Radius ─────────────────────────────────────────── */

export function RadiusSeg({ value, onChange, size = 40, checks = true }: { value: Radius; onChange: (r: Radius) => void; size?: number; checks?: boolean }) {
  return (
    <div className="cx-seg" role="group" aria-label="Radius">
      {RADII.map((r, i) => {
        const on = r === value
        return (
          <button
            key={r}
            type="button"
            className={`cx-seg-btn ${on ? 'is-on' : ''} ${i === 0 ? 'is-first' : ''} ${i === RADII.length - 1 ? 'is-last' : ''}`}
            style={{ height: size }}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation()
              onChange(r)
            }}
          >
            {on && checks && <Icon name="done" />}
            {r} km
          </button>
        )
      })}
    </div>
  )
}

/* ── City search ────────────────────────────────────── */

/**
 * Home city field: shows the current city (with its country as a hint); typing searches
 * Open-Meteo and lists matches under the field. `big` = the 56px field of the setup card / sheet.
 */
export function CitySearch({ value, onPick, autoFocus, big, icon = 'city', placeholder = 'City, e.g. Barcelona', surface }: { value: City | null; onPick: (c: City) => void; autoFocus?: boolean; big?: boolean; icon?: 'city' | 'search'; placeholder?: string; surface?: 'low' | 'high' }) {
  const [q, setQ] = useState(value?.name ?? '')
  const [focus, setFocus] = useState(false)
  const [hits, setHits] = useState<City[] | null>(null)
  const [err, setErr] = useState(false)
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setQ(value?.name ?? ''), [value?.name, value?.lat])
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])
  const typed = q.trim() !== (value?.name ?? '') && q.trim().length >= 2
  useEffect(() => {
    if (!typed) {
      setHits(null)
      return
    }
    const ctl = new AbortController()
    const t = window.setTimeout(() => {
      searchCities(q, ctl.signal)
        .then((h) => {
          setHits(h)
          setErr(false)
          setSel(0)
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') {
            setHits([])
            setErr(true)
          }
        })
    }, 250)
    return () => {
      ctl.abort()
      window.clearTimeout(t)
    }
  }, [q, typed])
  const pick = (c: City) => {
    onPick(c)
    setQ(c.name)
    setHits(null)
    ref.current?.blur()
  }
  const open = focus && typed && hits !== null
  return (
    <div className={`cx-city ${big ? 'is-big' : ''} ${surface === 'high' ? 'is-high' : ''}`} onClick={(e) => e.stopPropagation()}>
      <label className={`cx-field ${focus ? 'is-focus' : ''}`}>
        <Icon name={icon} />
        <input
          ref={ref}
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onFocus={(e) => {
            setFocus(true)
            e.target.select()
          }}
          onBlur={() => window.setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if (!hits?.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(hits.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(hits[sel])
            }
          }}
          aria-label="Home city"
          autoComplete="off"
          spellCheck={false}
        />
        {value && !typed && <span className="cx-field-hint">{value.country}</span>}
      </label>
      {open && (
        <div className="cx-menu" role="listbox">
          {hits!.map((c, i) => (
            <button key={`${c.lat},${c.lon}`} type="button" role="option" aria-selected={i === sel} className={`cx-menu-item ${i === sel ? 'is-sel' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <Icon name="location" />
              <span className="cx-menu-main">{c.name}</span>
              <span className="cx-menu-sub">{[c.admin, c.country].filter(Boolean).join(', ')}</span>
            </button>
          ))}
          {!hits!.length && <div className="cx-menu-none">{err ? 'Couldn’t search cities. Check your connection.' : 'No city by that name.'}</div>}
        </div>
      )}
    </div>
  )
}

/* ── Location picker ────────────────────────────────── */

function LocationBody({ home, radius, phone, onDone }: { home: City | null; radius: Radius; phone: boolean; onDone: () => void }) {
  return (
    <>
      <div className="cx-loc-group">
        <div className="cx-label">Home city</div>
        <CitySearch value={home} onPick={(c) => concertsStore.setHome(c)} big={phone} surface="low" />
      </div>
      <div className="cx-loc-group">
        <div className="cx-label">Radius</div>
        <RadiusSeg value={radius} onChange={(r) => concertsStore.setRadius(r)} size={phone ? 48 : 40} checks={!phone} />
      </div>
      <div className="cx-loc-hint">No GPS. Shows are matched to this city and refreshed once a day.</div>
      <div className="cx-loc-foot">
        <button type="button" className="cx-btn is-coral" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  )
}

export function LocationPicker({ home, radius, phone, onClose }: { home: City | null; radius: Radius; phone: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // desktop: click outside / Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const onDown = (e: PointerEvent) => {
      if (phone) return
      const el = e.target as Node
      if (ref.current?.contains(el) || (el as HTMLElement).closest?.('.cx-locpill')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, phone])
  if (phone)
    return createPortal(
      <>
        <div className="cx-scrim is-sheet" onClick={onClose} />
        <div className="cx-sheet" role="dialog" aria-label="Location" ref={ref}>
          <div className="cx-sheet-grip" />
          <div className="cx-sheet-title">Location</div>
          <LocationBody home={home} radius={radius} phone onDone={onClose} />
        </div>
      </>,
      document.body,
    )
  return (
    <div className="cx-pop" role="dialog" aria-label="Location" ref={ref}>
      <LocationBody home={home} radius={radius} phone={false} onDone={onClose} />
    </div>
  )
}

/* ── Misc ───────────────────────────────────────────── */

export function Clover({ size, tone, icon, iconSize, filled }: { size: number; tone: 'tonal' | 'surface'; icon: 'location' | 'eventBusy' | 'offline' | 'concerts'; iconSize: number; filled?: boolean }) {
  return (
    <span className={`cx-clover is-${tone}`} style={{ width: size, height: size }}>
      <i style={{ clipPath: SHAPE_CLOVER }} />
      <Icon name={icon} size={iconSize} filled={filled} />
    </span>
  )
}

export function Attribution({ short, children }: { short?: boolean; children?: ReactNode }) {
  return (
    <div className={`cx-attrib ${short ? 'is-short' : ''}`}>
      {!short && <Icon name="info" />}
      {children ?? (short ? 'Ticket info from Ticketmaster' : 'Ticket info from Ticketmaster. Tickets open on their site.')}
    </div>
  )
}

export function Shim({ w, h, r, className }: { w?: number | string; h: number; r?: number | string; className?: string }) {
  return <span className={`cx-shim ${className ?? ''}`} style={{ width: w, height: h, borderRadius: r }} />
}
