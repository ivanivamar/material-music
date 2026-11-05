/**
 * Add a show yourself (design_handoff_concerts §3): for shows Ticketmaster doesn't list. The kit
 * Dialog: 560px on desktop, full screen on the phone (back · title, Delete / Save in the bottom bar).
 *
 * Artist (library only, required) · Date (required, today or later) · Start time · Venue (required) ·
 * City (defaults to the home city) · Ticket link. Edit mode adds Delete. Saved shows live in Drive
 * concerts.json (state/concerts.ts); the daily Ticketmaster refresh never changes them.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconButton, Button, Dialog, useToast } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { useCover } from '../../lib/covers'
import { concertsStore, isoDay, type ManualShow } from '../../state/concerts'
import { artistMatches, shortDate } from '../../state/concertViews'
import { useLibrary, type Artist } from '../../state/library'
import { hueVars, useArtistLook, ArtistPhoto } from './parts'

export type DialogState = { mode: 'add' } | { mode: 'edit'; show: ManualShow }

interface Fields {
  artistId: string
  q: string
  date: string
  time: string
  venue: string
  city: string
  link: string
}

function SuggestRow({ artist, sub, onPick, sel }: { artist: Artist; sub: string; onPick: () => void; sel: boolean }) {
  const photo = useCover(artist.image?.id, artist.image?.v) ?? null
  return (
    <button type="button" className={`cx-menu-item is-artist ${sel ? 'is-sel' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={onPick}>
      <ArtistPhoto artist={artist} photo={photo} size={32} />
      <span className="cx-menu-main">{artist.name}</span>
      <span className="cx-menu-sub">{sub}</span>
    </button>
  )
}

function PickedArtist({ artist, onClear }: { artist: Artist; onClear: () => void }) {
  const look = useArtistLook(artist)
  return (
    <div className="cx-field is-picked" style={hueVars(look.H)}>
      <ArtistPhoto artist={artist} photo={look.photo} size={36} className="has-ring is-raised" />
      <span className="cx-picked-name">{artist.name}</span>
      <IconButton icon="x" label="Change artist" onClick={onClear} />
    </div>
  )
}

function Field({ label, opt, icon, type, value, onChange, placeholder, mono, err, wide }: { label: string; opt?: boolean; icon: IconName; type: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; err?: string; wide?: boolean }) {
  return (
    <div className={`cx-fgroup ${wide ? 'is-wide' : ''}`}>
      <div className="cx-label">
        {label}
        {opt && <span className="cx-opt">Optional</span>}
      </div>
      <label className={`cx-field ${err ? 'is-err' : ''}`}>
        <Icon name={icon} />
        <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={mono ? 'is-mono' : undefined} spellCheck={false} autoComplete="off" />
      </label>
      {err && <div className="cx-err">{err}</div>}
    </div>
  )
}

export function ShowDialog({ state, phone, homeCity, onClose }: { state: DialogState; phone: boolean; homeCity: string; onClose: () => void }) {
  const { data } = useLibrary()
  const toast = useToast()
  const edit = state.mode === 'edit' ? state.show : null
  const [f, setF] = useState<Fields>(() =>
    edit ? { artistId: edit.artistId, q: '', date: edit.date, time: edit.time ?? '', venue: edit.venue, city: edit.city, link: edit.link ?? '' } : { artistId: '', q: '', date: '', time: '', venue: '', city: homeCity, link: '' },
  )
  const [sel, setSel] = useState(0)
  const qRef = useRef<HTMLInputElement>(null)
  const patch = (p: Partial<Fields>) => setF((x) => ({ ...x, ...p }))
  const artist = f.artistId ? data?.artists[f.artistId] : undefined
  const sug = useMemo(() => (data && !artist ? artistMatches(data, f.q) : []), [data, artist, f.q])
  const today = isoDay(Date.now())
  const past = !!f.date && f.date < today
  const canSave = !!artist && !!f.date && !past && f.venue.trim().length > 0

  useEffect(() => {
    if (!edit) window.setTimeout(() => qRef.current?.focus({ preventScroll: true }), 60)
  }, [edit])

  const save = () => {
    if (!canSave || !artist) return
    const show: ManualShow = {
      id: edit?.id ?? `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      artistId: artist.id,
      date: f.date,
      time: f.time || undefined,
      venue: f.venue.trim(),
      city: f.city.trim() || homeCity,
      link: f.link.trim() || undefined,
    }
    concertsStore.saveShow(show)
    toast.show({ icon: 'check', text: `${edit ? 'Saved' : 'Added'} ${artist.name} · ${shortDate(show.date)}` })
    onClose()
  }
  const remove = () => {
    if (!edit) return
    concertsStore.removeShow(edit.id)
    toast.show({ icon: 'delete', mutedIcon: true, text: `Removed ${artist?.name ?? 'show'} at ${edit.venue}`, action: { label: 'Undo', onClick: () => concertsStore.saveShow(edit) } })
    onClose()
  }

  const artistBlock = (
    <div className="cx-fgroup is-wide is-artist">
      <div className="cx-label">Artist</div>
      {artist ? (
        <PickedArtist artist={artist} onClear={() => patch({ artistId: '', q: '' })} />
      ) : (
        <>
          <label className="cx-field is-focus">
            <Icon name="search" />
            <input
              ref={qRef}
              value={f.q}
              placeholder="Search artists in your library"
              onChange={(e) => {
                patch({ q: e.target.value })
                setSel(0)
              }}
              onKeyDown={(e) => {
                if (!sug.length) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSel((s) => Math.min(sug.length - 1, s + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSel((s) => Math.max(0, s - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  patch({ artistId: sug[sel].id, q: '' })
                }
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="Artist"
            />
          </label>
          {f.q.trim().length > 0 && data && (
            <div className="cx-menu is-artists">
              {sug.map((s, i) => (
                <SuggestRow key={s.id} artist={data.artists[s.id]} sub={`${s.releases} ${s.releases === 1 ? 'release' : 'releases'}`} sel={i === sel} onPick={() => patch({ artistId: s.id, q: '' })} />
              ))}
              {!sug.length && <div className="cx-menu-none">No artist in your library matches.</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
  const fields = (
    <div className="cx-fgrid">
      {artistBlock}
      <Field label="Date" icon="event" type="date" value={f.date} onChange={(v) => patch({ date: v })} mono err={past ? 'Pick today or a later date' : undefined} />
      <Field label="Start time" opt icon="clock" type="time" value={f.time} onChange={(v) => patch({ time: v })} mono />
      <Field label="Venue" icon="stadium" type="text" value={f.venue} onChange={(v) => patch({ venue: v })} placeholder="e.g. Razzmatazz" />
      <Field label="City" icon="city" type="text" value={f.city} onChange={(v) => patch({ city: v })} placeholder="City" />
      <Field label="Ticket link" opt icon="link" type="url" value={f.link} onChange={(v) => patch({ link: v })} placeholder="Paste a link" wide />
    </div>
  )
  const title = edit ? 'Edit show' : 'Add a show'
  const saveLabel = edit ? 'Save' : 'Add show'

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      subtitle={phone ? "For shows Ticketmaster doesn't list. Only you see it, and daily updates won't change it." : "Only you see it. Ticketmaster updates won't change it."}
      icon="editCalendar"
      size="lg"
      phone="full"
      actionsStart={
        edit && (
          <Button variant="ghost" icon="delete" className="cx-text-danger" onClick={remove}>
            Delete
          </Button>
        )
      }
      actions={
        <>
          {!phone && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button variant="filled" onClick={save} disabled={!canSave}>
            {saveLabel}
          </Button>
        </>
      }
    >
      {fields}
    </Dialog>
  )
}
