/**
 * Lyrics column of the full-screen player (Material 3 Expressive).
 *
 * Synced (LRC): the sung line expands into an expressive album-tinted tonal card with a glowing
 * accent bar, bold display typography, and live equaliser bars; surrounding lines stay crisp and
 * readable; the list glides between lines while clamping top/bottom bounds so there is never an
 * empty void at the start or end of a song. Click/tap a line to seek to it. Wheel or touch-scroll
 * browses freely (with a quick "Sync" pill to jump back), settling back on the sung line after idle.
 * Plain lyrics: an expressive, scrollable stanza column. None: empty state.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from 'react'
import { EmptyState, Eq, formatTime } from '../components/ui'
import { Icon } from '../design/icons'
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

const lineOpacity = (i: number, cur: number, browsing: boolean) => {
  if (i === cur) return 1
  if (browsing) return i < cur ? 0.68 : 0.82
  if (cur < 0) return Math.max(0.4, 0.9 - 0.08 * i)
  const d = i - cur
  return d < 0 ? Math.max(0.32, 0.52 - 0.06 * (-d - 1)) : Math.max(0.38, 0.84 - 0.09 * (d - 1))
}

const IDLE_MS = 3800

function SyncedLyrics({ lines, position, playing, trackId }: { lines: LyricLine[]; position: number; playing: boolean; trackId: string }) {
  const cur = useLineIndex(lines, position, playing)
  const focus = Math.max(cur, 0)
  const vpRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [offset, setOffset] = useState(0)
  const [minOffset, setMinOffset] = useState(0)
  const [manual, setManual] = useState(0)
  const [touching, setTouching] = useState(false)
  const [snap, setSnap] = useState(true)
  const idle = useRef(0)
  const touch = useRef({ y0: 0, y: 0, moved: false, swallow: false })

  // keep the focused line near 36% of the viewport, clamped so top/bottom never leave dead space
  useLayoutEffect(() => {
    const measure = () => {
      const vpH = vpRef.current?.clientHeight ?? 0
      const listH = listRef.current?.offsetHeight ?? 0
      const minOff = Math.min(0, vpH - listH)
      setMinOffset(minOff)
      const el = lineRefs.current[focus]
      if (el && vpH > 0) {
        const anchor = vpH * 0.36
        const ideal = anchor - (el.offsetTop + el.offsetHeight / 2)
        setOffset(Math.min(0, Math.max(minOff, ideal)))
      } else {
        setOffset(0)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (vpRef.current) ro.observe(vpRef.current)
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

  const scheduleReturn = () => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => setManual(0), IDLE_MS)
  }

  const onWheel = (e: WheelEvent) => {
    setManual((m) => Math.max(minOffset - offset, Math.min(-offset, m - e.deltaY)))
    scheduleReturn()
  }

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    window.clearTimeout(idle.current)
    const y = e.touches[0].clientY
    touch.current = { y0: y, y, moved: false, swallow: false }
  }

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    const y = e.touches[0].clientY
    const dy = y - touch.current.y
    touch.current.y = y
    if (!touch.current.moved) {
      if (Math.abs(y - touch.current.y0) < 6) return
      touch.current.moved = true
      touch.current.swallow = true
      setTouching(true)
    }
    setManual((m) => Math.max(minOffset - offset, Math.min(-offset, m + dy)))
  }

  const onTouchEnd = () => {
    if (touch.current.moved) {
      setTouching(false)
      scheduleReturn()
      window.setTimeout(() => {
        touch.current.swallow = false
      }, 300)
    }
  }

  const seekTo = (l: LyricLine) => {
    if (touch.current.swallow) return
    window.clearTimeout(idle.current)
    setManual(0)
    playerStore.seek(l.time + 0.01)
  }

  const y = Math.min(0, Math.max(minOffset, offset + manual))
  const topFade = y < -8
  const botFade = y > minOffset + 8
  const browsing = manual !== 0

  return (
    <>
      <div
        ref={vpRef}
        className={`ly-viewport ${topFade ? 'has-top-fade' : ''} ${botFade ? 'has-bot-fade' : ''}`}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          ref={listRef}
          className={`ly-list pg-anim ${snap ? 'is-snap' : ''} ${browsing ? 'is-manual' : ''} ${touching ? 'is-touching' : ''}`}
          style={{ transform: `translate3d(0, ${y}px, 0)` }}
        >
          {lines.map((l, i) => {
            const isOn = i === cur
            const isPast = cur >= 0 && i < cur
            const isNext = i === cur + 1
            return (
              <button
                key={i}
                ref={(el) => {
                  lineRefs.current[i] = el
                }}
                type="button"
                className={`ly-line pg-anim ${isOn ? 'is-on' : ''} ${isPast ? 'is-past' : ''} ${isNext ? 'is-next' : ''} ${l.text ? '' : 'is-gap'}`}
                style={{ opacity: lineOpacity(i, cur, browsing) }}
                onClick={() => seekTo(l)}
                aria-current={isOn ? 'true' : undefined}
                tabIndex={-1}
              >
                <span className="ly-bar" aria-hidden />
                <span className="ly-body">
                  {l.text ? (
                    <span className="ly-text">{l.text}</span>
                  ) : (
                    <span className={`ly-dots ${isOn && playing ? 'is-playing' : ''}`} aria-label="Instrumental break">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </span>
                <span className="ly-side" aria-hidden>
                  {isOn && <Eq playing={playing} />}
                  <span className="ly-time">{formatTime(l.time)}</span>
                </span>
              </button>
            )
          })}
        </div>
        {browsing && (
          <button
            type="button"
            className="ly-sync-btn"
            onClick={() => {
              window.clearTimeout(idle.current)
              setManual(0)
            }}
          >
            <Icon name="lyrics" />
            <span>Resume sync</span>
          </button>
        )}
      </div>
      <div className="ly-foot">
        <span className="ly-badge">
          <span className="ly-badge-dot" />
          SYNCED · LRC
        </span>
        <span className="ly-hint">TAP LINE TO SEEK</span>
      </div>
      <span className="sr-only" aria-live="polite">
        {cur >= 0 ? lines[cur].text : ''}
      </span>
    </>
  )
}

function PlainLyrics({ lines }: { lines: LyricLine[] }) {
  return (
    <>
      <div className="ly-viewport has-bot-fade">
        <div className="ly-plain">{lines.map((l, i) => (l.text ? <p key={i}>{l.text}</p> : <p key={i} className="is-gap" aria-hidden />))}</div>
      </div>
      <div className="ly-foot">
        <span className="ly-badge is-plain">UNSYNCED · FROM TAGS</span>
      </div>
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
