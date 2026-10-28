/**
 * Library health (Material 3 Expressive redesign).
 * Uses the exact Material list (.dt-list / .dt-row) from listening stats, album, and playlist pages.
 *
 * One tab per kind of problem, with numbered track rows, cover thumbnails, playback integration,
 * metadata, audio quality badges, and inline fix panels:
 *
 *   COVERS      Find cover (Cover Art Archive + iTunes, pick one) · Choose file · Ignore
 *   LYRICS      Fetch (LRCLIB) per song, Fetch all with progress banner · Ignore (instrumental)
 *   GENRE       Set genre: chips for artist's other albums / most used in library, or type one
 *   YEAR        Look up (MusicBrainz, iTunes) → chip for year, or type one
 *   DUPLICATES  Keep this one → other copies removed (Undo in toast) · Keep all
 *   LOW BITRATE Replace file (Upload page) · Ignore
 *
 * Fixes save immediately and update library catalogue.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  AlbumEq,
  Button,
  EmptyState,
  formatTime,
  IconButton,
  LinearProgress,
  QualityBadge,
  Segmented,
  Skeleton,
  qualityKind,
  qualityLabel,
  useToast,
  type SegOption,
} from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
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
import { playerStore } from '../../state/player'
import { playList, useNowPlaying } from '../library/playback'
import { fmtBytes, fmtN, monogram, plural } from '../../state/views'
import { PageHeader } from '../PageHeader'
import '../library/detail.css'
import './health.css'

interface TabDef {
  label: string
  kicker: string
  hint: string
  icon: IconName
}

const TAB_INFO: Record<IssueKind, TabDef> = {
  cover: {
    label: 'Covers',
    icon: 'album',
    kicker: 'Missing artwork',
    hint: 'Albums without a cover image. Find matching high-resolution covers online or upload an image file.',
  },
  lyrics: {
    label: 'Lyrics',
    icon: 'lyrics',
    kicker: 'Missing lyrics',
    hint: 'Songs without synced or plain lyrics. Automatically fetched from LRCLIB with timestamps.',
  },
  genre: {
    label: 'Genre',
    icon: 'smart',
    kicker: 'Missing genres',
    hint: 'Albums without a genre. Apply genres from other releases by the artist, library favorites, or type your own.',
  },
  year: {
    label: 'Year',
    icon: 'today',
    kicker: 'Missing release year',
    hint: 'Albums without a release year. Find release dates from MusicBrainz or type the year.',
  },
  duplicate: {
    label: 'Duplicates',
    icon: 'queue',
    kicker: 'Duplicate songs',
    hint: 'Tracks with identical ISRC or matching title, artist, and duration. Keep your preferred copy.',
  },
  bitrate: {
    label: 'Low bitrate',
    icon: 'stats',
    kicker: 'Low audio quality',
    hint: `FLAC files under ${LOW_KBPS} kbit/s or under 44.1 kHz. Replace with high-resolution lossless sources.`,
  },
}

const PAGE = 100
const errText = (e: unknown) =>
  e instanceof AuthError ? 'Sign in with Google again, then retry.' : ((e as Error)?.message ?? 'Something went wrong.')

export function Health() {
  const h = useHealth()
  const { data } = useLibrary()
  const { job } = useHealthState()
  const [tab, setTab] = useState<IssueKind | null>(null)

  const counts = h ? issueCount(h) : null
  const total = counts ? ISSUE_KINDS.reduce((n, k) => n + counts[k], 0) : 0
  const first = counts ? (ISSUE_KINDS.find((k) => counts[k] > 0) ?? 'cover') : 'cover'
  const current = tab ?? first

  const options: SegOption<IssueKind>[] = ISSUE_KINDS.map((k) => ({
    value: k,
    label: TAB_INFO[k].label,
    meta: counts ? fmtN(counts[k]) : '…',
  }))
  const ignoredN = Object.values(useHealthState().ignored).reduce((n, l) => n + (l?.length ?? 0), 0)
  const currentTab = TAB_INFO[current]

  return (
    <div className="health">
      <PageHeader
        meta={
          h
            ? total > 0
              ? `${plural(total, 'issue', 'issues')} to fix · ${plural(Object.values(counts!).filter((n) => n > 0).length, 'category', 'categories')}`
              : 'All clear · Library in top shape'
            : 'Analyzing library…'
        }
        title="Library health"
        tools={
          ignoredN > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              icon="eye"
              onClick={() => healthStore.clearIgnored()}
            >
              Show {fmtN(ignoredN)} ignored
            </Button>
          ) : undefined
        }
      />

      <div className="hl-tabs-wrap">
        <div className="hl-tabs">
          <Segmented label="Kind of problem" value={current} options={options} onChange={setTab} />
        </div>
      </div>

      <div className="hl-kicker-card">
        <div className="hl-kicker-icon" aria-hidden>
          <Icon name={currentTab.icon} size={22} />
        </div>
        <div className="hl-kicker-copy">
          <h2 className="hl-kicker-title">{currentTab.kicker}</h2>
          <p className="hl-kicker-hint">{currentTab.hint}</p>
        </div>
        {counts && counts[current] > 0 && (
          <div className="hl-kicker-badge">
            {fmtN(counts[current])} {plural(counts[current], 'item', 'items')}
          </div>
        )}
      </div>

      {!h || !data ? (
        <div className="hl-skel" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={64} radius={8} />
          ))}
        </div>
      ) : (
        <Body kind={current} h={h} c={data} />
      )}

      {job.running && current !== 'lyrics' && (
        <div className="hl-bg-banner">
          <span className="hl-bg-icon">
            <Icon name="lyrics" size={18} />
          </span>
          <span>
            Looking up lyrics in the background · {fmtN(job.done)} of {fmtN(job.total)}
          </span>
        </div>
      )}
    </div>
  )
}

function Body({ kind, h, c }: { kind: IssueKind; h: HealthData; c: Catalogue }) {
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [kind])
  const n = issueCount(h)[kind]
  if (!n) {
    return (
      <div className="hl-empty">
        <EmptyState icon="checkCircle" title={EMPTY[kind].title} body={EMPTY[kind].body} />
      </div>
    )
  }

  const more = (len: number) =>
    len > shown ? (
      <div className="hl-more">
        <Button variant="secondary" size="sm" icon="chevD" onClick={() => setShown((s) => s + PAGE)}>
          Show {Math.min(PAGE, len - shown)} more
        </Button>
        <span className="hl-more-count">
          {fmtN(shown)} of {fmtN(len)}
        </span>
      </div>
    ) : null

  switch (kind) {
    case 'cover':
      return (
        <>
          <div className="dt-list has-cover hl-list" role="list">
            {h.covers.slice(0, shown).map((a, i) => (
              <CoverRow key={a.id} index={i} album={a} c={c} />
            ))}
          </div>
          {more(h.covers.length)}
        </>
      )
    case 'year':
      return (
        <>
          <div className="dt-list has-cover hl-list" role="list">
            {h.years.slice(0, shown).map((a, i) => (
              <YearRow key={a.id} index={i} album={a} c={c} />
            ))}
          </div>
          {more(h.years.length)}
        </>
      )
    case 'genre':
      return (
        <>
          <div className="dt-list has-cover hl-list" role="list">
            {h.genres.slice(0, shown).map((a, i) => (
              <GenreRow key={a.id} index={i} album={a} c={c} />
            ))}
          </div>
          {more(h.genres.length)}
        </>
      )
    case 'lyrics':
      return (
        <>
          <LyricsBar songs={h.lyrics} />
          <div className="dt-list has-cover hl-list" role="list">
            {h.lyrics.slice(0, shown).map((t, i) => (
              <LyricsRow key={t.id} index={i} track={t} c={c} />
            ))}
          </div>
          {more(h.lyrics.length)}
        </>
      )
    case 'duplicate':
      return (
        <>
          <div className="hl-dup-container" role="list">
            {h.duplicates.slice(0, shown).map((g) => (
              <DupCard key={g.id} group={g} c={c} />
            ))}
          </div>
          {more(h.duplicates.length)}
        </>
      )
    case 'bitrate':
      return (
        <>
          <div className="dt-list has-cover hl-list" role="list">
            {h.bitrate.slice(0, shown).map((b, i) => (
              <BitrateRow key={b.track.id} index={i} track={b.track} why={b.why} c={c} />
            ))}
          </div>
          {more(h.bitrate.length)}
        </>
      )
  }
}

const EMPTY: Record<IssueKind, { title: string; body: string }> = {
  cover: { title: 'Every album has cover artwork', body: 'No albums in your library are missing artwork.' },
  lyrics: { title: 'Every song has lyrics', body: 'All tracks have synced or plain lyrics.' },
  genre: { title: 'Every album has a genre', body: 'All albums in your library have genres assigned.' },
  year: { title: 'Every album has a year', body: 'No albums in your library are missing release years.' },
  duplicate: { title: 'No likely duplicates', body: 'No duplicate songs found by ISRC or title and duration.' },
  bitrate: { title: 'No low-bitrate files', body: `All FLAC tracks meet high quality standards (>= ${LOW_KBPS} kbit/s, >= 44.1 kHz).` },
}

/* ── Pieces ─────────────────────────────────────────── */

function Art({ album, name }: { album?: Album; name: string }) {
  const url = useCover(album?.cover)
  return url ? (
    <img src={url} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="hl-mono">{monogram(name)}</span>
  )
}

interface RowProps {
  n: number
  art: ReactNode
  title: ReactNode
  sub: ReactNode
  status?: ReactNode
  duration?: ReactNode
  actions: ReactNode
  panel?: ReactNode
  expanded?: boolean
  isPlaying?: boolean
  nowPlaying?: boolean
  onPlay?: () => void
}

function Row({
  n,
  art,
  title,
  sub,
  status,
  duration,
  actions,
  panel,
  expanded,
  isPlaying,
  nowPlaying,
  onPlay,
}: RowProps) {
  const play = (e: MouseEvent) => {
    e.stopPropagation()
    if (!onPlay) return
    onPlay()
  }

  return (
    <div
      className={`dt-row ${expanded ? 'is-open' : ''} ${isPlaying ? 'is-current' : ''}`}
      role="row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button, input, form')) return
        if (onPlay) onPlay()
      }}
    >
      <div className="hl-row-main">
        <div className="dt-num">
          {isPlaying ? (
            <AlbumEq color="var(--brand)" height={14} on={nowPlaying} />
          ) : (
            <span className="dt-n">{n}</span>
          )}
          {onPlay && (
            <button
              type="button"
              className="dt-play"
              tabIndex={-1}
              aria-label={isPlaying && nowPlaying ? 'Pause' : 'Play'}
              onClick={play}
            >
              <Icon name={isPlaying && nowPlaying ? 'pauseF' : 'playF'} />
            </button>
          )}
        </div>
        <span className="dt-cover" aria-hidden>
          {art}
        </span>
        <div className="dt-text">
          <div className="dt-t">{title}</div>
          <div className="dt-s">{sub}</div>
        </div>
        {status && <div className="hl-row-stat">{status}</div>}
        {duration && <div className="dt-dur">{duration}</div>}
        <div className="hl-actions">{actions}</div>
      </div>
      {panel && <div className="hl-panel">{panel}</div>}
    </div>
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
      <span className="hl-dot-sep">·</span>
      <span>{plural(n, 'song', 'songs')}</span>
      {a.year ? (
        <>
          <span className="hl-dot-sep">·</span>
          <span>{a.year}</span>
        </>
      ) : null}
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
        toast.show({
          icon: 'x',
          mutedIcon: true,
          text: 'Hidden from this list.',
          meta: 'This device only',
          action: { label: 'Undo', onClick: () => healthStore.unignore(kind, [id]) },
        })
      }}
    />
  )
}

/* ── Covers ─────────────────────────────────────────── */

function CoverRow({ index, album, c }: { index: number; album: Album; c: Catalogue }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cands, setCands] = useState<CoverCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bad, setBad] = useState<Set<string>>(new Set())
  const file = useRef<HTMLInputElement>(null)

  const find = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setError(null)
    if (cands) return
    try {
      setCands(await coverCandidates(album))
    } catch {
      setCands([])
      setError('Could not reach MusicBrainz — check your network connection.')
    }
  }

  const save = async (src: Blob | string[], what: string) => {
    setBusy(true)
    setError(null)
    try {
      await setAlbumCover(album.id, src)
      toast.show({ icon: 'check', text: `Cover saved for ${album.title}.`, meta: what })
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const shownCands = (cands ?? []).filter((x) => !bad.has(x.id))

  return (
    <Row
      n={index + 1}
      art={<Art album={album} name={album.artist} />}
      title={albumLink(album)}
      sub={albumSub(album, c)}
      expanded={open}
      actions={
        <>
          <Button
            variant={open ? 'primary' : 'secondary'}
            size="sm"
            icon="search"
            disabled={busy}
            onClick={() => void find()}
          >
            {open ? 'Hide matches' : 'Find cover'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="upload"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
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
                  <Skeleton key={i} width={112} height={112} radius={14} />
                ))}
              </div>
            ) : shownCands.length ? (
              <div className="hl-cands">
                {shownCands.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="hl-cand"
                    disabled={busy}
                    onClick={() => void save(x.full, x.source)}
                    title={`${x.source} · ${x.caption}`}
                  >
                    <img src={x.thumb} alt="" onError={() => setBad((s) => new Set(s).add(x.id))} />
                    <span className="hl-cand-badge">{x.source}</span>
                  </button>
                ))}
              </div>
            ) : error ? null : (
              <div className="hl-note">
                <Icon name="info" size={16} />
                <span>No match found online. Choose an image file instead.</span>
              </div>
            )}
            {busy && (
              <div className="hl-note">
                <Icon name="autorenew" size={16} className="hl-spin" />
                <span>Saving the cover…</span>
              </div>
            )}
            {error && (
              <div className="hl-note is-error">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </div>
            )}
          </>
        )
      }
    />
  )
}

/* ── Year ───────────────────────────────────────────── */

function YearRow({ index, album, c }: { index: number; album: Album; c: Catalogue }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sugg, setSugg] = useState<YearSuggestion[] | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const look = async () => {
    if (open) {
      setOpen(false)
      return
    }
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
      n={index + 1}
      art={<Art album={album} name={album.artist} />}
      title={albumLink(album)}
      sub={albumSub(album, c)}
      expanded={open}
      actions={
        <>
          <Button
            variant={open ? 'primary' : 'secondary'}
            size="sm"
            icon="today"
            disabled={busy}
            onClick={() => void look()}
          >
            {open ? 'Hide' : 'Look up'}
          </Button>
          <IgnoreBtn kind="year" id={album.id} />
        </>
      }
      panel={
        open && (
          <>
            <div className="hl-chips">
              {sugg === null && <Skeleton width={140} height={36} radius={999} />}
              {sugg?.map((s) => (
                <button
                  key={s.year}
                  type="button"
                  className="hl-chip"
                  disabled={busy}
                  onClick={() => void save(s.year)}
                  title={s.title}
                >
                  <b>{s.year}</b>
                  <span className="hl-chip-source">{s.source}</span>
                </button>
              ))}
              <form
                className="hl-inline-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (valid) void save(typedYear)
                }}
              >
                <input
                  className="hl-input sm-num"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="YYYY"
                  aria-label="Year"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
                />
                <Button variant="secondary" size="sm" type="submit" disabled={!valid || busy}>
                  Save
                </Button>
              </form>
            </div>
            {sugg && !sugg.length && !error && (
              <div className="hl-note">
                <Icon name="info" size={16} />
                <span>Nothing found online for this title. Type the year above.</span>
              </div>
            )}
            {error && (
              <div className="hl-note is-error">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </div>
            )}
          </>
        )
      }
    />
  )
}

/* ── Genre ──────────────────────────────────────────── */

function GenreRow({ index, album, c }: { index: number; album: Album; c: Catalogue }) {
  const toast = useToast()
  const { doc } = useGenres()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const sugg = useMemo(() => (open ? genreSuggestions(c, doc, album) : null), [open, c, doc, album])

  const toggle = (g: string) =>
    setPick((p) =>
      p.some((x) => x.toLowerCase() === g.toLowerCase())
        ? p.filter((x) => x.toLowerCase() !== g.toLowerCase())
        : [...p, g],
    )

  const save = (list: string[]) => {
    if (!list.length) return
    setAlbumGenres(album.id, list)
    toast.show({
      icon: 'check',
      text: `${album.title}: ${list.join(', ')}.`,
      meta: 'Genre saved',
      action: { label: 'Undo', onClick: () => setAlbumGenres(album.id, []) },
    })
  }

  const addTyped = () => {
    const g = typed.trim()
    if (!g) return
    if (!pick.some((x) => x.toLowerCase() === g.toLowerCase())) setPick((p) => [...p, g])
    setTyped('')
  }

  const chip = (g: string) => {
    const on = pick.some((x) => x.toLowerCase() === g.toLowerCase())
    return (
      <button
        key={g}
        type="button"
        className={`hl-chip ${on ? 'is-on' : ''}`}
        aria-pressed={on}
        onClick={() => toggle(g)}
      >
        {on && <Icon name="done" size={16} />}
        <span>{g}</span>
      </button>
    )
  }

  return (
    <Row
      n={index + 1}
      art={<Art album={album} name={album.artist} />}
      title={albumLink(album)}
      sub={albumSub(album, c)}
      expanded={open}
      actions={
        <>
          <Button
            variant={open ? 'primary' : 'secondary'}
            size="sm"
            icon="smart"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Close' : 'Set genre'}
          </Button>
          <IgnoreBtn kind="genre" id={album.id} />
        </>
      }
      panel={
        open && sugg && (
          <>
            {sugg.fromArtist.length > 0 && (
              <div className="hl-group">
                <span className="hl-glabel">Other albums by {album.artist}</span>
                <div className="hl-chips">{sugg.fromArtist.map(chip)}</div>
              </div>
            )}
            {sugg.common.length > 0 && (
              <div className="hl-group">
                <span className="hl-glabel">Popular genres in your library</span>
                <div className="hl-chips">{sugg.common.map(chip)}</div>
              </div>
            )}
            <form
              className="hl-inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (typed.trim()) addTyped()
                else save(pick)
              }}
            >
              <input
                className="hl-input hl-input-wide"
                placeholder="Type a genre…"
                aria-label="Genre"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
              <Button variant="ghost" size="sm" disabled={!typed.trim()} onClick={addTyped}>
                Add
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="done"
                type="button"
                disabled={!pick.length}
                onClick={() => save(pick)}
              >
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
      <div className="hl-bar-icon" aria-hidden>
        <Icon name="lyrics" size={24} />
      </div>
      <div className="hl-bar-text">
        {job.running ? (
          <>
            <div className="hl-bar-title">Fetching lyrics from LRCLIB</div>
            <div className="hl-bar-sub">
              {fmtN(job.done)} of {fmtN(job.total)} songs processed · {fmtN(job.saved)} saved
            </div>
          </>
        ) : job.offline ? (
          <>
            <div className="hl-bar-title">LRCLIB is not responding</div>
            <div className="hl-bar-sub">Several requests failed · Please try again in a moment</div>
          </>
        ) : job.error ? (
          <>
            <div className="hl-bar-title">Lyrics found, but could not save</div>
            <div className="hl-bar-sub">{job.error}</div>
          </>
        ) : job.total && job.done ? (
          <>
            <div className="hl-bar-title">{plural(job.saved, 'song', 'songs')} updated with lyrics</div>
            <div className="hl-bar-sub">
              {job.done - job.saved > 0
                ? `${fmtN(job.done - job.saved)} songs not available on LRCLIB (skipped for 2 weeks)`
                : 'All done!'}
            </div>
          </>
        ) : (
          <>
            <div className="hl-bar-title">
              {worth ? `${fmtN(worth)} ${plural(worth, 'song', 'songs')} to look up` : 'All remaining songs were recently checked'}
            </div>
            <div className="hl-bar-sub">Synced (LRC) lyrics when available, otherwise plain text lyrics</div>
          </>
        )}
      </div>
      <div className="hl-bar-actions">
        {job.running ? (
          <Button variant="secondary" size="sm" onClick={cancelLyrics}>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon="lyrics"
            disabled={!worth}
            onClick={() => void fetchLyrics(songs.map((t) => t.id))}
          >
            Fetch all
          </Button>
        )}
      </div>
      {job.running && (
        <LinearProgress className="hl-bar-track" value={pct} />
      )}
    </div>
  )
}

function LyricsRow({ index, track, c }: { index: number; track: Track; c: Catalogue }) {
  const { lyricState, misses } = useHealthState()
  const album = c.albums[track.albumId]
  const s = lyricState[track.id]
  const missed = (misses[track.id] ?? 0) > 0
  const now = useNowPlaying()
  const isPlaying = now.id === track.id

  const statusPill =
    s === 'looking' ? (
      <span className="hl-status-pill is-active">
        <span className="hl-pulse-dot" /> Searching…
      </span>
    ) : s === 'none' || (missed && !s) ? (
      <span className="hl-status-pill is-muted">Not on LRCLIB</span>
    ) : s === 'error' ? (
      <span className="hl-status-pill is-error">Save failed</span>
    ) : undefined

  return (
    <Row
      n={index + 1}
      art={<Art album={album} name={track.artist} />}
      title={track.title}
      sub={
        <>
          <span>{track.artist}</span>
          {album ? (
            <>
              <span className="hl-dot-sep">·</span>
              <a className="hl-plain" href={albumHref(track.albumId)}>
                {album.title}
              </a>
            </>
          ) : null}
        </>
      }
      status={statusPill}
      duration={track.duration ? formatTime(track.duration) : '—'}
      isPlaying={isPlaying}
      nowPlaying={now.playing}
      onPlay={() => {
        if (isPlaying) playerStore.toggle()
        else playList([track.id], { kind: 'library', id: `health-${track.id}`, label: track.title })
      }}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon={s === 'none' || (missed && !s) ? 'refresh' : 'lyrics'}
            disabled={s === 'looking'}
            onClick={() => void fetchLyrics([track.id], { force: true })}
          >
            {s === 'none' || (missed && !s) ? 'Retry' : 'Fetch'}
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
  const now = useNowPlaying()
  const tracks = group.trackIds.map((id) => c.tracks[id]).filter(Boolean)
  if (tracks.length < 2) return null
  const keep = (id: string) =>
    void removeFromLibraryOp(toast, { kind: 'track', trackIds: tracks.filter((t) => t.id !== id).map((t) => t.id) })

  return (
    <div className="hl-dup-group">
      <div className="hl-dup-head">
        <div className="hl-dup-head-left">
          <span className="hl-dup-tag">
            <Icon name="queue" size={16} />
            <span>{group.why === 'isrc' ? 'Matching ISRC' : 'Matching title & artist'}</span>
          </span>
          <span className="hl-dup-count">{plural(tracks.length, 'version', 'versions')}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => healthStore.ignore('duplicate', [group.id])}
        >
          Keep all
        </Button>
      </div>
      <div className="dt-list has-cover hl-dup-list">
        {tracks.map((t, i) => {
          const album = c.albums[t.albumId]
          const k = kbpsOf(t)
          const isPlaying = now.id === t.id
          return (
            <div
              key={t.id}
              className={`dt-row hl-dup-row ${isPlaying ? 'is-current' : ''} ${i === 0 ? 'is-best' : ''}`}
              role="row"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a, button')) return
                if (isPlaying) playerStore.toggle()
                else playList([t.id], { kind: 'library', id: `dup-${t.id}`, label: t.title })
              }}
            >
              <div className="dt-num">
                {isPlaying ? (
                  <AlbumEq color="var(--brand)" height={14} on={now.playing} />
                ) : (
                  <span className="dt-n">{i + 1}</span>
                )}
                <button
                  type="button"
                  className="dt-play"
                  tabIndex={-1}
                  aria-label={isPlaying && now.playing ? 'Pause' : 'Play'}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isPlaying) playerStore.toggle()
                    else playList([t.id], { kind: 'library', id: `dup-${t.id}`, label: t.title })
                  }}
                >
                  <Icon name={isPlaying && now.playing ? 'pauseF' : 'playF'} />
                </button>
              </div>
              <span className="dt-cover" aria-hidden>
                <Art album={album} name={t.artist} />
              </span>
              <div className="dt-text">
                <div className="dt-t">
                  {t.title}
                  {i === 0 && (
                    <span className="hl-best-badge">
                      <Icon name="done" size={14} />
                      <span>Best copy</span>
                    </span>
                  )}
                </div>
                <div className="dt-s">
                  <span>{t.artist}</span>
                  <span className="hl-dot-sep">·</span>
                  <a className="hl-plain" href={albumHref(t.albumId)}>
                    {album?.title ?? 'Unknown album'}
                  </a>
                  {album?.year ? (
                    <>
                      <span className="hl-dot-sep">·</span>
                      <span>{album.year}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="hl-row-stat hl-dup-facts">
                <QualityBadge kind={qualityKind('flac', t.flac?.bitDepth, t.flac?.sampleRate)}>
                  {qualityLabel('flac', { bitDepth: t.flac?.bitDepth, sampleRate: t.flac?.sampleRate })}
                </QualityBadge>
                <span className="hl-dup-fact-meta">
                  {k ? `${k} kbit/s · ` : ''}
                  {fmtBytes(t.flac?.size ?? 0)}
                  {hasLyrics(t) && ' · Lyrics'}
                </span>
              </div>
              <div className="dt-dur">{t.duration ? formatTime(t.duration) : '—'}</div>
              <div className="hl-actions">
                <Button
                  variant={i === 0 ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => keep(t.id)}
                >
                  Keep this one
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Low bitrate ────────────────────────────────────── */

function BitrateRow({ index, track, why, c }: { index: number; track: Track; why: string; c: Catalogue }) {
  const toast = useToast()
  const album = c.albums[track.albumId]
  const now = useNowPlaying()
  const isPlaying = now.id === track.id

  return (
    <Row
      n={index + 1}
      art={<Art album={album} name={track.artist} />}
      title={track.title}
      sub={
        <>
          <span>{track.artist}</span>
          {album ? (
            <>
              <span className="hl-dot-sep">·</span>
              <a className="hl-plain" href={albumHref(track.albumId)}>
                {album.title}
              </a>
            </>
          ) : null}
        </>
      }
      status={
        <div className="hl-bitrate-status">
          <QualityBadge kind={qualityKind('flac', track.flac?.bitDepth, track.flac?.sampleRate)}>
            {qualityLabel('flac', { bitDepth: track.flac?.bitDepth, sampleRate: track.flac?.sampleRate })}
          </QualityBadge>
          <span className="hl-why-pill">{why}</span>
        </div>
      }
      duration={track.duration ? formatTime(track.duration) : '—'}
      isPlaying={isPlaying}
      nowPlaying={now.playing}
      onPlay={() => {
        if (isPlaying) playerStore.toggle()
        else playList([track.id], { kind: 'library', id: `health-${track.id}`, label: track.title })
      }}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon="upload"
            onClick={() => {
              go(href('upload'))
              toast.show({
                icon: 'upload',
                text: 'Drop a better file of this song.',
                meta: 'Upload → “Replace” keeps plays, likes and playlists',
                duration: 7000,
              })
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
