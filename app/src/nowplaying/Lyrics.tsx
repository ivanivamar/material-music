/**
 * Lyrics column of the full-screen player (handoff 08).
 *
 * Synced (LRC): the sung line sits at 42% of the column, lit white with a glow; lines fade with
 * distance; the list glides between lines (1.1s, default ease; instant with reduced motion).
 * Click a line to seek to it. Scrolling the wheel (or dragging with a finger) browses freely, and
 * the list settles back on the sung line a few seconds later.
 * The list's position is GSAP's (lib/gsap.ts), not a CSS transition: the wheel eases towards a
 * target that each tick moves on, a finger can grab the list mid-glide, and a flick keeps going
 * with momentum (InertiaPlugin) and stops inside the list's bounds.
 * Plain lyrics: a static, scrollable column. None: empty state.
 * Japanese / Korean lyrics: an optional romanised line under each line (lib/romaji.ts), switched by
 * the ROMAJI chip next to the source label (handoff 08: the chip only shows with lyrics on screen).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from 'react'
import { EASE, gsap } from '../lib/gsap'
import { useMotion } from '../state/motion'
import { EmptyState } from '../components/ui'
import { lineAt, parseLyrics, type LyricLine } from '../lib/lrc'
import { lyricsScript, useRomaji, type RomajiState } from '../lib/romaji'
import { settingsStore, useSettings } from '../state/settings'
import type { Track } from '../state/library'
import { playerStore, usePlayerPosition } from '../state/player'

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

/** ROMAJI / ROMANIZED chip (Japanese / Korean lyrics only); the setting is shared PC ↔ phone. */
function RomajiChip({ lines, romaji }: { lines: LyricLine[]; romaji: RomajiState }) {
  const { romaji: on } = useSettings()
  const script = lyricsScript(lines.map((l) => l.text))
  if (!script) return null
  const name = script === 'ko' ? 'ROMANIZED' : 'ROMAJI'
  const label = on ? (romaji.status === 'loading' ? `${name}…` : romaji.status === 'unavailable' ? `${name} · OFFLINE` : name) : name
  return (
    <button
      type="button"
      className={`ly-romaji t-mono ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      onClick={() => settingsStore.set('romaji', !on)}
      title={romaji.status === 'unavailable' ? 'Needs the internet the first time for this song' : undefined}
    >
      {label}
    </button>
  )
}

function SyncedLyrics({ lines, position, playing, trackId, romaji }: { lines: LyricLine[]; position: number; playing: boolean; trackId: string; romaji: RomajiState }) {
  const roma = romaji.status === 'ready' ? romaji.lines : null
  const cur = useLineIndex(lines, position, playing)
  const focus = Math.max(cur, 0)
  const motion = useMotion()
  const listRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  /** list position (translateY) that puts the focused line at 42% of the column */
  const [offset, setOffset] = useState(0)
  const [snap, setSnap] = useState(true)
  const live = useRef({ offset, motion })
  live.current = { offset, motion }
  /** browsing: the list stays where the wheel / finger left it until it settles back (IDLE_MS) */
  const browsing = useRef(false)
  const wheelTarget = useRef(0)
  const lastWheel = useRef(0)
  const idle = useRef(0)
  const touch = useRef({ y0: 0, y: 0, from: 0, t: 0, v: 0, moved: false, swallow: false })

  // centre the focused line (measured: lines wrap, and romaji adds a line under each)
  useLayoutEffect(() => {
    const measure = () => {
      const el = lineRefs.current[focus]
      if (el) setOffset(-(el.offsetTop + el.offsetHeight / 2))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (listRef.current) ro.observe(listRef.current)
    return () => ro.disconnect()
  }, [focus, lines, roma])

  // new track: jump, don't glide from the old song's position
  const [shownTrack, setShownTrack] = useState(trackId)
  if (shownTrack !== trackId) {
    setShownTrack(trackId)
    setSnap(true)
  }
  useEffect(() => {
    if (!snap) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)))
    return () => cancelAnimationFrame(raf)
  }, [snap])

  /** glide (or jump) to the sung line */
  const follow = (jump: boolean) => {
    const el = listRef.current
    if (!el) return
    if (jump || !live.current.motion) gsap.set(el, { y: live.current.offset, overwrite: true })
    else gsap.to(el, { y: live.current.offset, duration: 1.1, ease: EASE, overwrite: true })
  }

  // the sung line moved (or the track changed): follow it, unless the list is being browsed
  useLayoutEffect(() => {
    if (snap) {
      browsing.current = false
      window.clearTimeout(idle.current)
    }
    if (!browsing.current) follow(snap)
  }, [offset, snap, motion])

  useEffect(() => {
    const el = listRef.current
    return () => {
      window.clearTimeout(idle.current)
      if (el) gsap.killTweensOf(el)
    }
  }, [])

  const settleLater = () => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => {
      browsing.current = false
      follow(false)
    }, IDLE_MS)
  }
  /** keep some of the list in view: y within [-list height, 0] */
  const bounds = () => ({ min: -(listRef.current?.offsetHeight ?? 0), max: 0 })
  const clamp = (y: number) => {
    const { min, max } = bounds()
    return Math.max(min, Math.min(max, y))
  }
  const currentY = () => (listRef.current ? (gsap.getProperty(listRef.current, 'y') as number) : 0)

  // wheel: each tick moves a target; the list eases towards it (no restart per tick)
  const onWheel = (e: WheelEvent) => {
    const el = listRef.current
    if (!el) return
    const delta = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY
    // a new burst of wheel ticks starts from wherever the list is (it may have been flung or dragged)
    if (!browsing.current || e.timeStamp - lastWheel.current > 250) wheelTarget.current = currentY()
    lastWheel.current = e.timeStamp
    browsing.current = true
    wheelTarget.current = clamp(wheelTarget.current - delta)
    if (live.current.motion) gsap.to(el, { y: wheelTarget.current, duration: 0.45, ease: 'power3.out', overwrite: true })
    else gsap.set(el, { y: wheelTarget.current, overwrite: true })
    settleLater()
  }

  // touch: a vertical drag browses (the phone has no wheel); a tap still seeks; a flick glides on
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    window.clearTimeout(idle.current)
    const el = listRef.current
    // grab the list where it is, mid-glide included
    if (el) gsap.killTweensOf(el)
    const y = e.touches[0].clientY
    touch.current = { y0: y, y, from: currentY(), t: e.timeStamp, v: 0, moved: false, swallow: false }
    if (browsing.current) settleLater()
  }
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = touch.current
    const y = e.touches[0].clientY
    if (!t.moved) {
      if (Math.abs(y - t.y0) < 6) return
      t.moved = true
      t.swallow = true
      browsing.current = true
    }
    const dt = e.timeStamp - t.t
    if (dt > 0) t.v = 0.8 * ((y - t.y) / dt) + 0.2 * t.v
    t.y = y
    t.t = e.timeStamp
    if (listRef.current) gsap.set(listRef.current, { y: clamp(t.from + (y - t.y0)) })
  }
  const onTouchEnd = (e: TouchEvent) => {
    const t = touch.current
    if (!t.moved) {
      // a tap that only stopped a glide: let the list carry on to the sung line
      if (!browsing.current) follow(false)
      return
    }
    const el = listRef.current
    // finger held still before lifting: no fling
    const v = e.timeStamp - t.t > 80 ? 0 : t.v
    if (el && live.current.motion && Math.abs(v) > 0.05) {
      const { min, max } = bounds()
      gsap.to(el, { inertia: { y: { velocity: v * 1000, min, max }, duration: { min: 0.3, max: 1.6 } }, overwrite: true })
    }
    settleLater()
    window.setTimeout(() => {
      t.swallow = false
    }, 300)
  }

  const seekTo = (l: LyricLine) => {
    if (touch.current.swallow) return
    window.clearTimeout(idle.current)
    browsing.current = false
    playerStore.seek(l.time + 0.01)
    // same line again: offset won't change, so glide back from the browsed spot here
    follow(false)
  }

  return (
    <>
      <div className="ly-viewport" onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div ref={listRef} className="ly-list">
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
              {l.text && roma?.[i] && (
                <span className="ly-roma" lang="und-Latn">
                  {roma[i]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="ly-meta">
        <RomajiChip lines={lines} romaji={romaji} />
        <span className="t-mono">SYNCED · LRC</span>
      </div>
      <span className="sr-only" aria-live="polite">
        {cur >= 0 ? lines[cur].text : ''}
      </span>
    </>
  )
}

function PlainLyrics({ lines, romaji }: { lines: LyricLine[]; romaji: RomajiState }) {
  const roma = romaji.status === 'ready' ? romaji.lines : null
  return (
    <>
      <div className="ly-viewport">
        <div className="ly-plain">
          {lines.map((l, i) =>
            l.text ? (
              <p key={i}>
                {l.text}
                {roma?.[i] && (
                  <span className="ly-roma" lang="und-Latn">
                    {roma[i]}
                  </span>
                )}
              </p>
            ) : (
              <p key={i} className="is-gap" aria-hidden />
            ),
          )}
        </div>
      </div>
      <div className="ly-meta">
        <RomajiChip lines={lines} romaji={romaji} />
        <span className="t-mono">UNSYNCED · FROM TAGS</span>
      </div>
    </>
  )
}

/** Lyrics that follow the player's position (the only part of the player screen that re-renders with it). */
export function LiveLyrics({ track, playing }: { track: Track; playing: boolean }) {
  const position = usePlayerPosition()
  return <Lyrics track={track} position={position} playing={playing} />
}

export function Lyrics({ track, position, playing }: { track: Track; position: number; playing: boolean }) {
  const lyrics = useMemo(() => parseLyrics(track.lyrics), [track.lyrics])
  const texts = useMemo(() => lyrics?.lines.map((l) => l.text) ?? null, [lyrics])
  const { romaji: romajiOn } = useSettings()
  const romaji = useRomaji(texts, romajiOn)
  if (!lyrics) {
    return (
      <div className="ly-empty">
        <EmptyState icon="lyrics" title="No lyrics for this track." body="Add synced (LRC) or plain lyrics to the FLAC tags and run the importer again." />
      </div>
    )
  }
  return lyrics.synced ? <SyncedLyrics lines={lyrics.lines} position={position} playing={playing} trackId={track.id} romaji={romaji} /> : <PlainLyrics lines={lyrics.lines} romaji={romaji} />
}
