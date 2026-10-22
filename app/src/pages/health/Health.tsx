/**
 * Library health (step 35). One tab per kind of problem, each row with its quick fix:
 *
 *   COVERS      Find cover (Cover Art Archive + iTunes, pick one) · Choose file · Ignore
 *   LYRICS      Fetch (LRCLIB) per song, Fetch all with progress · Ignore (instrumental)
 *   GENRE       Set genre: one tap on a suggestion (artist's other albums / most used) or type one
 *   YEAR        Look up (MusicBrainz, iTunes) → tap a year, or type one
 *   DUPLICATES  Keep this one → the other copies are removed (Undo in the toast) · Keep all
 *   LOW BITRATE Replace file (Upload page) · Ignore
 *
 * Fixes save at once; the row leaves the list because the list is computed from the catalogue.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, EmptyState, IconButton, QualityBadge, Segmented, Skeleton, qualityKind, qualityLabel, useToast, type SegOption } from '../../components/ui'
import { useCover } from '../../lib/covers'
import { AuthError } from '../../lib/drive'
import { removeFromLibraryOp } from '../../actions/ops'
import { albumHref, artistHref, go, href } from '../../shell/routes'
import {
  cancelLyrics,
  coverCandidates,
  fetchLyrics,
  genreSuggestions,
  hasLyrics,
  healthStore,
  ISSUE_KINDS,
  issueCount,
  kbpsOf,
  LOW_KBPS,
  setAlbumCover,
  setAlbumGenres,
  setAlbumYear,
  useHealth,
  useHealthState,
  yearSuggestions,
  type CoverCandidate,
  type DupGroup,
  type Health as HealthData,
  type IssueKind,
  type YearSuggestion,
} from '../../state/health'
import { useGenres } from '../../state/genres'
import { useLibrary, type Album, type Catalogue, type Track } from '../../state/library'
import { fmtBytes, fmtN, monogram, plural } from '../../state/views'
import { PageHeader } from '../PageHeader'
import './health.css'

const TABS: Record<IssueKind, { label: string; hint: string; }> = {
  cover: { label: 'Covers', hint: 'ALBUMS WITH NO COVER IMAGE' },
  lyrics: { label: 'Lyrics', hint: 'SONGS WITHOUT LYRICS · FROM LRCLIB, SYNCED WHEN THEY HAVE IT' },
  genre: { label: 'Genre', hint: 'ALBUMS WITH NO GENRE FROM THE TAGS, YOU OR MUSICBRAINZ' },
  year: { label: 'Year', hint: 'ALBUMS WITHOUT A RELEASE YEAR' },
  duplicate: { label: 'Duplicates', hint: 'SAME ISRC, OR SAME TITLE + ARTIST AND LENGTH' },
  bitrate: { label: 'Low bitrate', hint: `FLAC FILES UNDER ${LOW_KBPS} KBIT/S, OR UNDER 44.1 KHZ` },
}
const PAGE = 100
const errText = (e: unknown) => (e instanceof AuthError ? 'Sign in with Google again, then retry.' : ((e as Error)?.message ?? 'Something went wrong.'))

export function Health() {
  const h = useHealth()
  const { data } = useLibrary()
  const { job } = useHealthState()
  const [tab, setTab] = useState<IssueKind | null>(null)

  const counts = h ? issueCount(h) : null
  const total = counts ? ISSUE_KINDS.reduce((n, k) => n + counts[k], 0) : 0
  // open on the first tab that has something to fix
  const first = counts ? (ISSUE_KINDS.find((k) => counts[k] > 0) ?? 'cover') : 'cover'
  const current = tab ?? first

  const options: SegOption<IssueKind>[] = ISSUE_KINDS.map((k) => ({ value: k, label: TABS[k].label, meta: counts ? fmtN(counts[k]) : '…' }))
  const ignoredN = Object.values(useHealthState().ignored).reduce((n, l) => n + (l?.length ?? 0), 0)

  return (
    <div className="health">
      <PageHeader
        meta={h ? (total ? `${plural(total, 'THING', 'THINGS')} TO FIX` : 'ALL CLEAR') : 'LOOKING AT THE LIBRARY…'}
        title="Library health"
        tools={
          ignoredN > 0 ? (
            <button type="button" className="hl-link" onClick={() => healthStore.clearIgnored()}>
              Show {fmtN(ignoredN)} ignored again
            </button>
          ) : undefined
        }
      />
      <div className="hl-tabs">
        <Segmented label="Kind of problem" value={current} options={options} onChange={setTab} />
      </div>
      <p className="hl-hint">{TABS[current].hint}</p>
      {!h || !data ? (
        <div className="hl-skel" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={64} radius={10} />
          ))}
        </div>
      ) : (
        <Body kind={current} h={h} c={data} />
      )}
      {job.running && current !== 'lyrics' && <div className="hl-bg">Looking up lyrics in the background · {job.done} of {job.total}</div>}
    </div>
  )
}

function Body({ kind, h, c }: { kind: IssueKind; h: HealthData; c: Catalogue }) {
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [kind])
  const n = issueCount(h)[kind]
  if (!n)
    return (
      <div className="hl-empty">
        <EmptyState icon="check" title={EMPTY[kind]} body="Nothing here needs fixing." />
      </div>
    )
  const more = (len: number) =>
    len > shown ? (
      <div className="hl-more">
        <Button variant="secondary" size="sm" onClick={() => setShown((s) => s + PAGE)}>
          Show {Math.min(PAGE, len - shown)} more
        </Button>
        <span>
          {fmtN(shown)} OF {fmtN(len)}
        </span>
      </div>
    ) : null
  switch (kind) {
    case 'cover':
      return (
        <>
          <ul className="hl-list">{h.covers.slice(0, shown).map((a) => <CoverRow key={a.id} album={a} c={c} />)}</ul>
          {more(h.covers.length)}
        </>
      )
    case 'year':
      return (
        <>
          <ul className="hl-list">{h.years.slice(0, shown).map((a) => <YearRow key={a.id} album={a} c={c} />)}</ul>
          {more(h.years.length)}
        </>
      )
    case 'genre':
      return (
        <>
          <ul className="hl-list">{h.genres.slice(0, shown).map((a) => <GenreRow key={a.id} album={a} c={c} />)}</ul>
          {more(h.genres.length)}
        </>
      )
    case 'lyrics':
      return (
        <>
          <LyricsBar songs={h.lyrics} />
          <ul className="hl-list">{h.lyrics.slice(0, shown).map((t) => <LyricsRow key={t.id} track={t} c={c} />)}</ul>
          {more(h.lyrics.length)}
        </>
      )
    case 'duplicate':
      return (
        <>
          <ul className="hl-list">{h.duplicates.slice(0, shown).map((g) => <DupCard key={g.id} group={g} c={c} />)}</ul>
          {more(h.duplicates.length)}
        </>
      )
    case 'bitrate':
      return (
        <>
          <ul className="hl-list">{h.bitrate.slice(0, shown).map((b) => <BitrateRow key={b.track.id} track={b.track} why={b.why} c={c} />)}</ul>
          {more(h.bitrate.length)}
        </>
      )
  }
}

const EMPTY: Record<IssueKind, string> = {
  cover: 'Every album has a cover.',
  lyrics: 'Every song has lyrics.',
  genre: 'Every album has a genre.',
  year: 'Every album has a year.',
  duplicate: 'No likely duplicates.',
  bitrate: 'No low-bitrate files.',
}

/* ── Pieces ─────────────────────────────────────────── */

function Art({ album, name }: { album?: Album; name: string }) {
  const url = useCover(album?.cover)
  return <span className="hl-art">{url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="hl-mono">{monogram(name)}</span>}</span>
}

function Row({ art, title, sub, status, actions, panel }: { art: ReactNode; title: ReactNode; sub: ReactNode; status?: ReactNode; actions: ReactNode; panel?: ReactNode }) {
  return (
    <li className="hl-row">
      <div className="hl-main">
        {art}
        <div className="hl-text">
          <div className="hl-title">{title}</div>
          <div className="hl-sub">{sub}</div>
        </div>
        {status && <div className="hl-status">{status}</div>}
        <div className="hl-actions">{actions}</div>
      </div>
      {panel && <div className="hl-panel">{panel}</div>}
    </li>
  )
}

const albumLink = (a: Album) => (
  <a className="hl-link-title" href={albumHref(a.id)}>
    {a.title}
  </a>
)
const albumSub = (a: Album, c: Catalogue) => {
  const n = Object.values(c.tracks).filter((t) => t.albumId === a.id).length
  return (
    <>
      <a href={artistHref(a.artistId)} className="hl-plain">
        {a.artist}
      </a>
      {' · '}
      {plural(n, 'SONG')}
      {a.year ? ` · ${a.year}` : ''}
    </>
  )
}

function IgnoreBtn({ kind, id, label = 'Ignore' }: { kind: IssueKind; id: string; label?: string }) {
  const toast = useToast()
  return (
    <IconButton
      icon="x"
      size="sm"
      label={label}
      onClick={() => {
        healthStore.ignore(kind, [id])
        toast.show({ icon: 'x', mutedIcon: true, text: 'Hidden from this list.', meta: 'THIS DEVICE ONLY', action: { label: 'Undo', onClick: () => healthStore.unignore(kind, [id]) } })
      }}
    />
  )
}

/* ── Covers ─────────────────────────────────────────── */

function CoverRow({ album, c }: { album: Album; c: Catalogue }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cands, setCands] = useState<CoverCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bad, setBad] = useState<Set<string>>(new Set())
  const file = useRef<HTMLInputElement>(null)

  const find = async () => {
    setOpen(true)
    setError(null)
    if (cands) return
    try {
      setCands(await coverCandidates(album))
    } catch {
      setCands([])
      setError('Could not reach MusicBrainz — check the connection.')
    }
  }
  const save = async (src: Blob | string[], what: string) => {
    setBusy(true)
    setError(null)
    try {
      await setAlbumCover(album.id, src)
      toast.show({ icon: 'check', text: `Cover saved for ${album.title}.`, meta: what.toUpperCase() })
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }
  const shownCands = (cands ?? []).filter((x) => !bad.has(x.id))
  return (
    <Row
      art={<Art album={album} name={album.artist} />}
      title={albumLink(album)}
      sub={albumSub(album, c)}
      actions={
        <>
          <Button variant="secondary" size="sm" icon="search" disabled={busy} onClick={() => void find()}>
            Find cover
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => file.current?.click()}>
            Choose file
          </Button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void save(f, 'from your file')
            }}
          />
          <IgnoreBtn kind="cover" id={album.id} />
        </>
      }
      panel={
        open && (
          <>
            {cands === null ? (
              <div className="hl-cands">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width={104} height={104} radius={8} />
                ))}
              </div>
            ) : shownCands.length ? (
              <div className="hl-cands">
                {shownCands.map((x) => (
                  <button key={x.id} type="button" className="hl-cand" disabled={busy} onClick={() => void save(x.full, x.source)} title={`${x.source} · ${x.caption}`}>
                    <img src={x.thumb} alt="" onError={() => setBad((s) => new Set(s).add(x.id))} />
                    <span>{x.source.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            ) : error ? null : (
              <div className="hl-note">No match found online. Choose an image file instead.</div>
            )}
            {busy && <div className="hl-note">Saving the cover…</div>}
            {error && <div className="hl-note is-error">{error}</div>}
          </>
        )
      }
    />
  )
}

/* ── Year ───────────────────────────────────────────── */

function YearRow({ album, c }: { album: Album; c: Catalogue }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sugg, setSugg] = useState<YearSuggestion[] | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const look = async () => {
    setOpen(true)
    setError(null)
    if (sugg) return
    try {
      setSugg(await yearSuggestions(album))
    } catch {
      setSugg([])
      setError('Could not reach MusicBrainz — type the year instead.')
    }
  }
  const save = async (year: number) => {
    setBusy(true)
    setError(null)
    try {
      const prev = await setAlbumYear(album.id, year)
      toast.show({
        icon: 'check',
        text: `${album.title} is from ${year}.`,
        action: { label: 'Undo', onClick: () => void setAlbumYear(album.id, prev ?? null).catch(() => undefined) },
      })
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }
  const typedYear = Number(typed)
  const valid = /^\d{4}$/.test(typed) && typedYear >= 1900 && typedYear <= new Date().getFullYear() + 1
  return (
    <Row
      art={<Art album={album} name={album.artist} />}
      title={albumLink(album)}
      sub={albumSub(album, c)}
      actions={
        <>
          <Button variant="secondary" size="sm" icon="search" disabled={busy} onClick={() => void look()}>
            Look up
          </Button>
          <IgnoreBtn kind="year" id={album.id} />
        </>
      }
      panel={
        open && (
          <>
            <div className="hl-chips">
              {sugg === null && <Skeleton width={160} height={34} radius={999} />}
              {sugg?.map((s) => (
                <button key={s.year} type="button" className="hl-chip" disabled={busy} onClick={() => void save(s.year)} title={s.title}>
                  <b>{s.year}</b>
                  <span>{s.source.toUpperCase()}</span>
                </button>
              ))}
              <form
                className="hl-inline"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (valid) void save(typedYear)
                }}
              >
                <input className="hl-input" inputMode="numeric" maxLength={4} placeholder="Year" aria-label="Year" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
                <Button variant="secondary" size="sm" type="submit" disabled={!valid || busy}>
                  Save
                </Button>
              </form>
            </div>
            {sugg && !sugg.length && !error && <div className="hl-note">Nothing found online for this title. Type the year.</div>}
            {error && <div className="hl-note is-error">{error}</div>}
          </>
        )
      }
    />
  )
}

/* ── Genre ──────────────────────────────────────────── */

function GenreRow({ album, c }: { album: Album; c: Catalogue }) {
  const toast = useToast()
  const { doc } = useGenres()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const sugg = useMemo(() => (open ? genreSuggestions(c, doc, album) : null), [open, c, doc, album])
  const toggle = (g: string) => setPick((p) => (p.some((x) => x.toLowerCase() === g.toLowerCase()) ? p.filter((x) => x.toLowerCase() !== g.toLowerCase()) : [...p, g]))
  const save = (list: string[]) => {
    if (!list.length) return
    setAlbumGenres(album.id, list)
    toast.show({ icon: 'check', text: `${album.title}: ${list.join(', ')}.`, meta: 'GENRE SAVED', action: { label: 'Undo', onClick: () => setAlbumGenres(album.id, []) } })
  }
  const addTyped = () => {
    const g = typed.trim()
    if (!g) return
    if (!pick.some((x) => x.toLowerCase() === g.toLowerCase())) setPick((p) => [...p, g])
    setTyped('')
  }
  const chip = (g: string) => (
    <button key={g} type="button" className={`hl-chip ${pick.some((x) => x.toLowerCase() === g.toLowerCase()) ? 'is-on' : ''}`} aria-pressed={pick.some((x) => x.toLowerCase() === g.toLowerCase())} onClick={() => toggle(g)}>
      {g}
    </button>
  )
  return (
    <Row
      art={<Art album={album} name={album.artist} />}
      title={albumLink(album)}
      sub={albumSub(album, c)}
      actions={
        <>
          <Button variant="secondary" size="sm" icon="smart" onClick={() => setOpen((o) => !o)}>
            Set genre
          </Button>
          <IgnoreBtn kind="genre" id={album.id} />
        </>
      }
      panel={
        open && sugg && (
          <>
            {sugg.fromArtist.length > 0 && (
              <div className="hl-group">
                <span className="hl-glabel">OTHER ALBUMS BY {album.artist.toUpperCase()}</span>
                <div className="hl-chips">{sugg.fromArtist.map(chip)}</div>
              </div>
            )}
            {sugg.common.length > 0 && (
              <div className="hl-group">
                <span className="hl-glabel">MOST USED IN YOUR LIBRARY</span>
                <div className="hl-chips">{sugg.common.map(chip)}</div>
              </div>
            )}
            <form
              className="hl-inline"
              onSubmit={(e) => {
                e.preventDefault()
                if (typed.trim()) addTyped()
                else save(pick)
              }}
            >
              <input className="hl-input hl-input-wide" placeholder="Type a genre" aria-label="Genre" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <Button variant="ghost" size="sm" disabled={!typed.trim()} onClick={addTyped}>
                Add
              </Button>
              <Button variant="primary" size="sm" type="button" disabled={!pick.length} onClick={() => save(pick)}>
                Save{pick.length ? ` · ${pick.join(', ')}` : ''}
              </Button>
            </form>
          </>
        )
      }
    />
  )
}

/* ── Lyrics ─────────────────────────────────────────── */

function LyricsBar({ songs }: { songs: Track[] }) {
  const { job, misses } = useHealthState()
  const now = Date.now()
  const worth = songs.filter((t) => (misses[t.id] ?? 0) < now - 14 * 86_400_000).length
  const pct = job.total ? Math.min(1, job.done / job.total) : 0
  return (
    <div className="hl-bar">
      <div className="hl-bar-text">
        {job.running ? (
          <>
            <b>
              {fmtN(job.done)} of {fmtN(job.total)}
            </b>
            <span>
              {job.saved} SAVED · LOOKING ON LRCLIB
            </span>
          </>
        ) : job.offline ? (
          <>
            <b>LRCLIB isn’t answering.</b>
            <span>SEVERAL REQUESTS IN A ROW FAILED · TRY AGAIN IN A MINUTE</span>
          </>
        ) : job.error ? (
          <>
            <b>Lyrics found, but not saved.</b>
            <span>{job.error.toUpperCase()}</span>
          </>
        ) : job.total && job.done ? (
          <>
            <b>{plural(job.saved, 'SONG')} got lyrics.</b>
            <span>{job.done - job.saved > 0 ? `${fmtN(job.done - job.saved)} NOT ON LRCLIB · SKIPPED FOR 2 WEEKS` : 'DONE'}</span>
          </>
        ) : (
          <>
            <b>{worth ? `${fmtN(worth)} songs to look up.` : 'Everything left was already tried.'}</b>
            <span>SYNCED (LRC) LYRICS WHEN LRCLIB HAS THEM, ELSE PLAIN</span>
          </>
        )}
      </div>
      {job.running ? (
        <Button variant="secondary" size="sm" onClick={cancelLyrics}>
          Stop
        </Button>
      ) : (
        <Button variant="primary" size="sm" icon="lyrics" disabled={!worth} onClick={() => void fetchLyrics(songs.map((t) => t.id))}>
          Fetch all
        </Button>
      )}
      {job.running && <div className="hl-bar-line" style={{ width: `${pct * 100}%` }} aria-hidden />}
    </div>
  )
}

function LyricsRow({ track, c }: { track: Track; c: Catalogue }) {
  const { lyricState, misses } = useHealthState()
  const album = c.albums[track.albumId]
  const s = lyricState[track.id]
  const missed = (misses[track.id] ?? 0) > 0
  return (
    <Row
      art={<Art album={album} name={track.artist} />}
      title={track.title}
      sub={
        <>
          {track.artist}
          {album ? ` · ${album.title}` : ''}
        </>
      }
      status={s === 'looking' ? 'LOOKING…' : s === 'none' || (missed && !s) ? 'NOT ON LRCLIB' : s === 'error' ? 'COULDN’T SAVE' : undefined}
      actions={
        <>
          <Button variant="secondary" size="sm" icon="lyrics" disabled={s === 'looking'} onClick={() => void fetchLyrics([track.id], { force: true })}>
            {s === 'none' || (missed && !s) ? 'Try again' : 'Fetch'}
          </Button>
          <IgnoreBtn kind="lyrics" id={track.id} label="Instrumental / ignore" />
        </>
      }
    />
  )
}

/* ── Duplicates ─────────────────────────────────────── */

function DupCard({ group, c }: { group: DupGroup; c: Catalogue }) {
  const toast = useToast()
  const tracks = group.trackIds.map((id) => c.tracks[id]).filter(Boolean)
  if (tracks.length < 2) return null
  const keep = (id: string) => void removeFromLibraryOp(toast, { kind: 'track', trackIds: tracks.filter((t) => t.id !== id).map((t) => t.id) })
  return (
    <li className="hl-dup">
      <div className="hl-dup-head">
        <span>{group.why === 'isrc' ? 'SAME ISRC' : 'SAME TITLE + ARTIST'}</span>
        <button type="button" className="hl-link" onClick={() => healthStore.ignore('duplicate', [group.id])}>
          Keep all
        </button>
      </div>
      {tracks.map((t, i) => {
        const album = c.albums[t.albumId]
        const k = kbpsOf(t)
        return (
          <div key={t.id} className="hl-dup-row">
            <Art album={album} name={t.artist} />
            <div className="hl-text">
              <div className="hl-title">
                {t.title}
                {i === 0 && <span className="hl-best">BEST COPY</span>}
              </div>
              <div className="hl-sub">
                {t.artist} · <a className="hl-plain" href={albumHref(t.albumId)}>{album?.title ?? 'Unknown album'}</a>
                {album?.year ? ` · ${album.year}` : ''}
              </div>
            </div>
            <div className="hl-facts">
              <QualityBadge kind={qualityKind('flac', t.flac?.bitDepth, t.flac?.sampleRate)}>{qualityLabel('flac', { bitDepth: t.flac?.bitDepth, sampleRate: t.flac?.sampleRate })}</QualityBadge>
              <span>
                {k ? `${k} KBIT/S · ` : ''}
                {fmtBytes(t.flac?.size ?? 0)}
                {hasLyrics(t) ? ' · LYRICS' : ''}
              </span>
            </div>
            <Button variant={i === 0 ? 'secondary' : 'ghost'} size="sm" onClick={() => keep(t.id)}>
              Keep this one
            </Button>
          </div>
        )
      })}
    </li>
  )
}

/* ── Low bitrate ────────────────────────────────────── */

function BitrateRow({ track, why, c }: { track: Track; why: string; c: Catalogue }) {
  const toast = useToast()
  const album = c.albums[track.albumId]
  return (
    <Row
      art={<Art album={album} name={track.artist} />}
      title={track.title}
      sub={
        <>
          {track.artist}
          {album ? ` · ${album.title}` : ''}
        </>
      }
      status={
        <span className="hl-q">
          <QualityBadge kind={qualityKind('flac', track.flac?.bitDepth, track.flac?.sampleRate)}>{qualityLabel('flac', { bitDepth: track.flac?.bitDepth, sampleRate: track.flac?.sampleRate })}</QualityBadge>
          <span>{why.toUpperCase()}</span>
        </span>
      }
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon="upload"
            onClick={() => {
              go(href('upload'))
              toast.show({ icon: 'upload', text: 'Drop a better file of this song.', meta: 'UPLOAD → “REPLACE” KEEPS PLAYS, LIKES AND PLAYLISTS', duration: 7000 })
            }}
          >
            Replace file
          </Button>
          <IgnoreBtn kind="bitrate" id={track.id} />
        </>
      }
    />
  )
}
