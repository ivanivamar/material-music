/**
 * Lyrics column of the full-screen player (handoff 08).
 *
 * Synced (LRC): the sung line sits at 42% of the column, lit white with a glow; lines fade with
 * distance; the list glides between lines (1.1s, default ease; instant with reduced motion).
 * Click a line to seek to it. Scrolling the wheel browses freely, and the list settles back on
 * the sung line a few seconds later.
 * Plain lyrics: a static, scrollable column. None: empty state.
 * Romaji / English chips from the handoff are left out until the catalogue has that data.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import { EmptyState } from '../components/ui'
import { lineAt, parseLyrics, type LyricLine } from '../lib/lrc'
import type { Track } from '../state/library'
import { playerStore } from '../state/player'

/**
 * The engine reports position ~4×/s; between reports we extrapolate from the wall clock so
 * lines change on time. Only re-renders when the line index changes.
 */
function useLineIndex(lines: LyricLine[] | null, position: number, playing: boolean): number {
  const reported = lines ? lineAt(lines, position) : -1
  // extrapolated index, tagged with the report it was extrapolated from
  const [ahead, setAhead] = useState<{ pos: number; idx: number } | null>(null)
  const anchor = useRef({ pos: position, at: 0 })
  useEffect(() => {
    anchor.current = { pos: position, at: performance.now() }
  }, [position])
  useEffect(() => {
    if (!lines || !playing) return
    let raf = 0
    const tick = () => {
      const { pos, at } = anchor.current
      // never run more than 1 s ahead of the last report (stalls, buffering)
      const idx = lineAt(lines, pos + Math.min(1, (performance.now() - at) / 1000) + 0.05)
      setAhead((a) => (a && a.pos === pos && a.idx === idx ? a : { pos, idx }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lines, playing])
  return playing && ahead && ahead.pos === position ? Math.max(reported, ahead.idx) : reported
}

const lineOpacity = (i: number, cur: number) => {
  if (i === cur) return 1
  const d = i - cur
  return d < 0 ? Math.max(0.1, 0.42 - 0.1 * (-d - 1)) : Math.max(0.12, 0.55 - 0.12 * (d - 1))
}

const IDLE_MS = 3500

function SyncedLyrics({ lines, position, playing, trackId }: { lines: LyricLine[]; position: number; playing: boolean; trackId: string }) {
  const cur = useLineIndex(lines, position, playing)
  const focus = Math.max(cur, 0)
  const listRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [offset, setOffset] = useState(0)
  const [manual, setManual] = useState(0)
  const [snap, setSnap] = useState(true)
  const idle = useRef(0)

  // centre the focused line (measured: lines wrap)
  useLayoutEffect(() => {
    const measure = () => {
      const el = lineRefs.current[focus]
      if (el) setOffset(-(el.offsetTop + el.offsetHeight / 2))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (listRef.current) ro.observe(listRef.current)
    return () => ro.disconnect()
  }, [focus, lines])

  // new track: jump, don't glide from the old song's position
  const [shownTrack, setShownTrack] = useState(trackId)
  if (shownTrack !== trackId) {
    setShownTrack(trackId)
    setSnap(true)
    setManual(0)
  }
  useEffect(() => {
    if (!snap) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)))
    return () => cancelAnimationFrame(raf)
  }, [snap])

  useEffect(() => () => window.clearTimeout(idle.current), [])

  const onWheel = (e: WheelEvent) => {
    // keep some of the list in view: total shift stays within [-list height, 0]
    const h = listRef.current?.offsetHeight ?? 0
    setManual((m) => Math.max(-h - offset, Math.min(-offset, m - e.deltaY)))
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => setManual(0), IDLE_MS)
  }

  const seekTo = (l: LyricLine) => {
    window.clearTimeout(idle.current)
    setManual(0)
    playerStore.seek(l.time + 0.01)
  }

  return (
    <>
      <div className="ly-viewport" onWheel={onWheel}>
        <div ref={listRef} className={`ly-list pg-anim ${snap ? 'is-snap' : ''} ${manual ? 'is-manual' : ''}`} style={{ transform: `translateY(${offset + manual}px)` }}>
          {lines.map((l, i) => (
            <button
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              type="button"
              className={`ly-line pg-anim ${i === cur ? 'is-on' : ''} ${l.text ? '' : 'is-gap'}`}
              style={{ opacity: lineOpacity(i, cur) }}
              onClick={() => seekTo(l)}
              aria-current={i === cur ? 'true' : undefined}
              tabIndex={-1}
            >
              {l.text || '· · ·'}
            </button>
          ))}
        </div>
      </div>
      <div className="ly-meta t-mono">SYNCED · LRC</div>
      <span className="sr-only" aria-live="polite">
        {cur >= 0 ? lines[cur].text : ''}
      </span>
    </>
  )
}

function PlainLyrics({ lines }: { lines: LyricLine[] }) {
  return (
    <>
      <div className="ly-viewport">
        <div className="ly-plain">{lines.map((l, i) => (l.text ? <p key={i}>{l.text}</p> : <p key={i} className="is-gap" aria-hidden />))}</div>
      </div>
      <div className="ly-meta t-mono">UNSYNCED · FROM TAGS</div>
    </>
  )
}

export function Lyrics({ track, position, playing }: { track: Track; position: number; playing: boolean }) {
  const lyrics = useMemo(() => parseLyrics(track.lyrics), [track.lyrics])
  if (!lyrics) {
    return (
      <div className="ly-empty">
        <EmptyState icon="lyrics" title="No lyrics for this track." body="Add synced (LRC) or plain lyrics to the FLAC tags and run the importer again." />
      </div>
    )
  }
  return lyrics.synced ? <SyncedLyrics lines={lyrics.lines} position={position} playing={playing} trackId={track.id} /> : <PlainLyrics lines={lyrics.lines} />
}
