/**
 * Lyrics column of the full-screen player (handoff 08).
 *
 * Synced (LRC): the sung line sits at 42% of the column, lit white with a glow; lines fade with
 * distance; the list glides between lines (1.1s, default ease; instant with reduced motion).
 * Click a line to seek to it. Scrolling the wheel (or dragging with a finger) browses freely, and
 * the list settles back on the sung line a few seconds later.
 * Plain lyrics: a static, scrollable column. None: empty state.
 * Japanese / Korean lyrics: an optional romanised line under each line (lib/romaji.ts), switched by
 * the ROMAJI chip next to the source label (handoff 08: the chip only shows with lyrics on screen).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from 'react'
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
  const listRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [offset, setOffset] = useState(0)
  const [manual, setManual] = useState(0)
  const [snap, setSnap] = useState(true)
  const idle = useRef(0)
  const touch = useRef({ y0: 0, y: 0, moved: false, swallow: false })

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
    setManual(0)
  }
  useEffect(() => {
    if (!snap) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)))
    return () => cancelAnimationFrame(raf)
  }, [snap])

  useEffect(() => () => window.clearTimeout(idle.current), [])

  const settleLater = () => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => setManual(0), IDLE_MS)
  }
  // keep some of the list in view: total shift stays within [-list height, 0]
  const clampManual = (m: number) => {
    const h = listRef.current?.offsetHeight ?? 0
    return Math.max(-h - offset, Math.min(-offset, m))
  }

  const onWheel = (e: WheelEvent) => {
    setManual((m) => clampManual(m - e.deltaY))
    settleLater()
  }

  // touch: a vertical drag browses (the phone has no wheel); a tap still seeks
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
    }
    setManual((m) => clampManual(m + dy))
  }
  const onTouchEnd = () => {
    if (!touch.current.moved) return
    settleLater()
    window.setTimeout(() => {
      touch.current.swallow = false
    }, 300)
  }

  const seekTo = (l: LyricLine) => {
    if (touch.current.swallow) return
    window.clearTimeout(idle.current)
    setManual(0)
    playerStore.seek(l.time + 0.01)
  }

  return (
    <>
      <div className="ly-viewport" onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
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
