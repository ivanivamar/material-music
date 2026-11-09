/**
 * The queue as a Material 3 multi-browse carousel (Nov 2026 carousel player) — one component for every
 * player surface:
 *   - `bar`   desktop player bar:      [ HERO: the playing song ] [medium: next] [pill]
 *   - `mini`  phone mini player:       the same, with the play button and a progress line on the hero
 *   - `full`  phone full-screen player: a giant hero, one played pill before it, labels above
 *   - `strip` desktop full-screen player: a short row under the square cover — the next song large,
 *             the one after medium, then square tiles (the playing song is the big cover above it).
 *             Like the mini player, a click plays the song; the wheel browses.
 *
 * - Every card is the cover, full bleed, with the text on a scrim (title + artist on the hero,
 *   title on the medium card, nothing on the pills). The row always fills its width exactly
 *   (layout.ts), so the last pill is never cut.
 * - Browse, then confirm: wheel / arrow keys / a sideways swipe / a click on another card make that card
 *   the hero, with Play now · Play next · Remove on it; after a few idle seconds (or "Now playing")
 *   the carousel springs back to the playing song. Small cards offer Play next / Remove on hover.
 * - Bar: clicking the playing song's card opens the full-screen player. Mini: tapping a card plays it
 *   (the playing one: play / pause), with a ripple and a small press-in pop; the handle opens full screen.
 * - Holding a card (450 ms) enters reorder mode with that song in hand (grab.ts → ReorderView).
 * - Phone: flick a card up to remove it (Undo in the toast).
 * - While the DJ plays there is no upcoming queue: only played songs and the current one show.
 *
 * Only the visible cards mount, so a whole library in the queue costs nothing.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { AlbumEq, Button, CookieButton, IconButton } from '../../components/ui'
import { LikeButton } from '../../components/LikeButton'
import { nowPlayingStore } from '../../state/nowPlaying'
import { playerStore, usePlayer } from '../../state/player'
import { useDjView } from '../../state/djUi'
import { isTouch, useIsPhone } from '../../state/viewport'
import { albumHref, artistHref } from '../../shell/routes'
import { IntroSub } from '../../dj/DjIntro'
import { NpLink } from '../parts'
import { nowKicker, useProgress, useQueueEdits } from '../player'
import { multiBrowse, type CarouselSizes, type Slot } from './layout'
import { useQueueItem } from './useQueueItem'
import { ItemArt } from './ItemArt'
import { grabIntoReorder, LONG_PRESS_MS, LONG_PRESS_SLOP } from './grab'
import './carousel.css'

export type CarouselVariant = 'bar' | 'mini' | 'full' | 'strip'

/** Browsing springs back to the playing song after this long without input (ms). */
const SPRING_BACK = 4000
/** Wheel distance per browse step (px), swipe distance per step (px), swipe-up distance to remove. */
const WHEEL_STEP = 70
const SWIPE_STEP = 90
const SWIPE_MIN = 36
const FLICK_UP = 50

/** Sizes per surface, from the measured width (px). `morph` (phone full screen only) blends from the
 *  mini player's sizes (0) to the full screen's (1) while the player is being dragged open / closed. */
function sizesFor(variant: CarouselVariant, w: number, morph: number): CarouselSizes {
  if (variant === 'bar') return { hero: Math.min(280, Math.round(w * 0.58)), med: 120, small: 48, gap: 8, prev: 0 }
  if (variant === 'strip') return { hero: 300, med: 200, small: 112, gap: 8, prev: 0 }
  const mini = { hero: Math.max(160, w - 126), med: 82, small: 32 }
  if (variant === 'mini') return { ...mini, gap: 8, prev: 0 }
  const full = { hero: Math.min(w - 80, 360), med: 72, small: 40 }
  const m = Math.max(0, Math.min(1, morph))
  const mix = (a: number, b: number) => Math.round(a + (b - a) * m)
  return { hero: mix(mini.hero, full.hero), med: mix(mini.med, full.med), small: mix(mini.small, full.small), gap: 8, prev: m > 0.5 ? 1 : 0 }
}

type Group = 'played' | 'now' | 'next'
const GROUP_LABEL: Record<Group, string> = { played: 'Played', now: 'Now playing', next: 'Up next' }

export function QueueCarousel({ variant, className, morph = 1 }: { variant: CarouselVariant; className?: string; morph?: number }) {
  const p = usePlayer()
  const dj = useDjView()
  const phone = useIsPhone()
  const edits = useQueueEdits()
  // the DJ keeps no upcoming queue: played songs and the current one only
  const count = p.index < 0 ? 0 : dj.on ? p.index + 1 : p.queue.length

  /* ── browse ─────────────────────────────────────────── */
  // the card the carousel rests on: the playing song (the strip, under the big cover: the next one)
  const anchor = variant === 'strip' ? Math.min(p.index + 1, Math.max(0, count - 1)) : p.index
  const [browse, setBrowse] = useState<number | null>(null)
  if (browse !== null && (browse === anchor || browse >= count)) setBrowse(null)
  const focus = browse ?? anchor
  const hovering = useRef(false)
  const springRef = useRef(0)
  const browseTo = (i: number | null) => {
    window.clearTimeout(springRef.current)
    const next = i === null || i === anchor ? null : Math.max(0, Math.min(count - 1, i))
    setBrowse(next)
  }
  useEffect(() => {
    if (browse === null) return
    const arm = () => {
      window.clearTimeout(springRef.current)
      springRef.current = window.setTimeout(() => (hovering.current ? arm() : setBrowse(null)), SPRING_BACK)
    }
    arm()
    return () => window.clearTimeout(springRef.current)
  }, [browse])

  /* ── measure ────────────────────────────────────────── */
  const vpRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = vpRef.current
    if (!el) return
    const update = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const labels = variant === 'full'
  const labelSpace = labels ? 28 * Math.max(0, Math.min(1, morph)) : 0
  const cardH = Math.max(0, box.h - labelSpace)
  const slots = box.w > 0 && count > 0 ? multiBrowse(count, focus, box.w, sizesFor(variant, box.w, morph)) : []
  const groupOf = (i: number): Group => (i < p.index ? 'played' : i === p.index ? 'now' : 'next')

  /* ── gestures: wheel, swipe, flick up, long press ───── */
  const wheelAcc = useRef(0)
  const onWheel = (e: WheelEvent) => {
    if (count < 2) return
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    wheelAcc.current += d
    if (Math.abs(wheelAcc.current) < WHEEL_STEP) return
    const step = wheelAcc.current > 0 ? 1 : -1
    wheelAcc.current = 0
    browseTo(focus + step)
  }
  const press = useRef<{ x: number; y: number; type: string; index: number | null; timer: number } | null>(null)
  const swallowClick = useRef(false)
  const cancelHold = () => {
    if (press.current) window.clearTimeout(press.current.timer)
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-qi]')
    const index = card ? Number(card.dataset.qi) : null
    swallowClick.current = false
    cancelHold()
    const start = { x: e.clientX, y: e.clientY, type: e.pointerType, index, timer: 0 }
    // hold a card to lift it into reorder mode (not on its buttons, not while the DJ plays)
    if (index !== null && !dj.on && !(e.target as HTMLElement).closest('button:not(.qc-hit), a')) {
      const pointerId = e.pointerId
      start.timer = window.setTimeout(() => {
        swallowClick.current = true
        press.current = null
        try {
          navigator.vibrate?.(12)
        } catch {
          /* not supported */
        }
        grabIntoReorder({ index: index === p.index ? null : index, pointerId, x: start.x, y: start.y })
      }, LONG_PRESS_MS)
    }
    press.current = start
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = press.current
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > LONG_PRESS_SLOP) cancelHold()
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = press.current
    press.current = null
    if (!s) return
    window.clearTimeout(s.timer)
    if (s.type === 'mouse') return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (dy < -FLICK_UP && Math.abs(dy) > Math.abs(dx) && s.index !== null && s.index !== p.index && !dj.on) {
      swallowClick.current = true
      edits.remove(s.index)
      return
    }
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) && count > 1) {
      swallowClick.current = true
      const steps = Math.max(1, Math.round(Math.abs(dx) / SWIPE_STEP))
      browseTo(focus + (dx < 0 ? steps : -steps))
    }
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      browseTo(focus + (e.key === 'ArrowRight' ? 1 : -1))
    } else if (e.key === 'Escape' && browse !== null) {
      e.preventDefault()
      e.stopPropagation()
      browseTo(null)
    }
  }
  const onCardClick = (i: number) => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    // mini player and the desktop strip: a click plays that song (the playing one: play / pause)
    if (variant === 'mini' || variant === 'strip') {
      browseTo(null)
      playerStore.jump(i)
      return
    }
    if (i === focus) {
      if (i === p.index && variant !== 'full') nowPlayingStore.open('np')
      return
    }
    browseTo(i)
  }


  return (
    <div
      ref={vpRef}
      className={`qc qc-${variant} ${phone ? 'is-phone' : ''} ${morph < 1 ? 'is-morphing' : ''} ${className ?? ''}`}
      style={{ '--qc-morph': morph } as CSSProperties}
      role="list"
      aria-label="Queue"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        cancelHold()
        press.current = null
      }}
      onKeyDown={onKeyDown}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
    >
      {slots.map((s, k) => {
        const g = groupOf(s.index)
        // a label above the first visible card of each group (full screen)
        const label = labels && (k === 0 || groupOf(slots[k - 1].index) !== g) ? GROUP_LABEL[g] : null
        return (
          <CarouselCard
            key={s.index}
            slot={s}
            variant={variant}
            id={p.queue[s.index]}
            group={g}
            focused={s.index === focus}
            browsing={browse !== null}
            height={cardH}
            label={label}
            next={s.index === p.index + 1}
            canEdit={!dj.on}
            onClick={() => onCardClick(s.index)}
            onPlayNow={() => {
              browseTo(null)
              playerStore.jump(s.index)
            }}
            onPlayNext={() => {
              browseTo(null)
              edits.playNext(s.index)
            }}
            onRemove={() => {
              browseTo(null)
              edits.remove(s.index)
            }}
          />
        )
      })}
      {browse !== null &&
        (variant === 'full' || variant === 'strip' ? (
          <Button variant="album" size="sm" icon="nowPlaying" className="qc-back" onClick={() => browseTo(null)}>
            {variant === 'strip' ? 'Back to up next' : 'Now playing'}
          </Button>
        ) : (
          <IconButton icon="nowPlaying" label="Back to the playing song" size="sm" className="qc-back" onClick={() => browseTo(null)} />
        ))}
    </div>
  )
}

interface CardProps {
  slot: Slot
  variant: CarouselVariant
  id: string
  group: Group
  focused: boolean
  browsing: boolean
  height: number
  label: string | null
  /** the song right after the playing one */
  next: boolean
  canEdit: boolean
  onClick: () => void
  onPlayNow: () => void
  onPlayNext: () => void
  onRemove: () => void
}

function CarouselCard({ slot, variant, id, group, focused, browsing, height, label, next, canEdit, onClick, onPlayNow, onPlayNext, onRemove }: CardProps) {
  const p = usePlayer()
  const dj = useDjView()
  const item = useQueueItem(id)
  const { intro, track, album, title } = item
  const now = group === 'now'
  const hero = slot.kind === 'hero'
  const showText = hero || (slot.kind === 'med' && slot.w >= 90)
  const full = variant === 'full'
  const strip = variant === 'strip'
  const mini = variant === 'mini'
  // the mini player plays on tap, so no browse actions there
  const actions = hero && !now && canEdit && !mini
  const quick = !hero && group !== 'now' && canEdit && !mini && !isTouch() && slot.w >= 44
  // mini / strip: a press-in pop on the card that was clicked to play (the ripple itself is the global one, design/ripple.ts)
  const [pop, setPop] = useState(false)
  const click = () => {
    if ((mini || strip) && !now) setPop(true)
    onClick()
  }

  const kicker = now
    ? nowKicker(p, dj)
    : strip && group === 'next' && !next
      ? 'Later'
      : GROUP_LABEL[group]

  const by = track ? ` by ${track.artist}` : ''
  const aria = mini || strip
    ? `${now ? (p.playing ? 'Pause' : 'Play') : 'Play'} ${title}${by}`
    : now
      ? `${p.playing ? 'Playing' : 'Paused'}: ${title}${by}${variant === 'bar' ? '. Open the player.' : ''}`
      : `${title}${by} · ${GROUP_LABEL[group]}`

  const style = { '--qc-x': `${slot.x}px`, '--qc-w': `${slot.w}px`, '--qc-h': `${height}px` } as CSSProperties

  return (
    <div
      role="listitem"
      className={`qc-card pg-anim is-${slot.kind} is-${group} ${focused ? 'is-focus' : ''} ${hero && now && p.playing ? 'is-playing' : ''} ${browsing && hero ? 'is-browsed' : ''}`}
      style={style}
      data-qi={slot.index}
    >
      {label && <span className={`qc-label is-${group}`}>{label}</span>}
      <div className={`qc-face ${pop ? 'is-pop' : ''}`} onAnimationEnd={(e) => e.target === e.currentTarget && setPop(false)}>
        <div className="qc-art" aria-hidden>
          <ItemArt item={item} size={Math.min(slot.w, height)} active={now} />
        </div>
        {showText && <span className="qc-scrim" aria-hidden />}
        <button type="button" className="qc-hit" aria-label={aria} aria-current={now ? 'true' : undefined} onClick={click} />

        {showText && (
          <div className="qc-text">
            {hero && (
              <span className={`qc-kicker ${now && dj.on ? 'is-dj' : ''}`}>
                {now && !intro && <AlbumEq height={11} on={p.playing} />}
                {kicker}
              </span>
            )}
            <span className="qc-title">{title}</span>
            {hero &&
              (intro ? (
                now && <span className="qc-sub"><IntroSub item={id} /></span>
              ) : track && full && now ? (
                <span className="qc-sub is-links">
                  <NpLink href={artistHref(track.artistId)}>{track.artist}</NpLink>
                  {album && (
                    <>
                      {' · '}
                      <NpLink href={albumHref(album.id)}>{album.title}</NpLink>
                    </>
                  )}
                </span>
              ) : (
                item.sub && <span className="qc-sub">{item.sub}</span>
              ))}
          </div>
        )}

        {hero && now && !intro && track && (full || variant === 'bar') && !browsing && <LikeButton trackId={track.id} size="md" ink className="qc-like" />}

        {/* mini player controls; the phone full screen keeps them while it morphs from / into the mini player */}
        {hero && now && (mini || full) && (
          <span className="qc-mini-ctl">
            <CookieButton
              size={48}
              iconSize={24}
              className="qc-play"
              playing={p.playing}
              icon={p.playing || p.buffering ? 'pauseF' : 'playF'}
              label={p.playing ? 'Pause' : 'Play'}
              loading={p.buffering}
              onClick={() => playerStore.toggle()}
            />
            <MiniProgress />
          </span>
        )}

        {actions && (
          <div className="qc-actions">
            {/* the strip plays on click already */}
            {!strip && <IconButton icon="playF" label="Play now" size={full ? 'md' : 'sm'} className="qc-act is-primary" onClick={onPlayNow} />}
            <IconButton icon="playNext" label="Play next" size={full ? 'md' : 'sm'} className="qc-act" onClick={onPlayNext} />
            <IconButton icon="x" label="Remove from the queue" size={full ? 'md' : 'sm'} className="qc-act" onClick={onRemove} />
          </div>
        )}
        {quick && (
          <div className="qc-quick">
            <IconButton icon="playNext" label="Play next" size="sm" className="qc-act" onClick={onPlayNext} />
            <IconButton icon="x" label="Remove from the queue" size="sm" className="qc-act" onClick={onRemove} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Mini player: a solid progress line along the bottom edge of the playing card (no wave, no animation). */
function MiniProgress() {
  const pct = useProgress() * 100
  return (
    <span className="qc-progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}
