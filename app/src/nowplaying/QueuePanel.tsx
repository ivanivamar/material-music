/**
 * Queue panel (handoff 07 Queue + 08 demo): 460px right panel that slides in over 0.8s with a scrim.
 * Toggled from the player bar and the full-screen player; over the full-screen player it sits
 * below its 84px header, elsewhere it sits above the player bar.
 *
 *   PLAYING FROM ALBUM · ZANMU / Queue          [shuffle] [Clear] [×]
 *   now playing row (eq, glowing title, position)
 *   PLAYED ──────────────── 03 · 11:02 ⌄   (collapsible; rows: play again · remove)
 *   NEXT UP ─────────────── 05 · 18:50
 *   rows: drag handle · cover · title/artist · length · ↑ play next · × remove   (click = play)
 *   DRAG TO REORDER · ↑ PLAY NEXT · × REMOVE
 *
 * Long queues (a whole library from Songs) are windowed: only rows near the viewport mount.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Eq, formatTime, useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { useCover } from '../lib/covers'
import { useLibrary, type Catalogue } from '../state/library'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer } from '../state/player'
import { fmtTotal } from '../state/views'
import { contextLine } from './parts'
import './queue.css'

const ROW = 60 // 58px row + 2px gap
const OVERSCAN = 8

function useListWindow(ref: React.RefObject<HTMLDivElement | null>, count: number, active: boolean) {
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, 24)])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active) return
    let raf = 0
    const update = () => {
      raf = 0
      const from = Math.max(0, Math.floor(el.scrollTop / ROW) - OVERSCAN)
      const to = Math.min(count, Math.ceil((el.scrollTop + el.clientHeight) / ROW) + OVERSCAN)
      setRange((r) => (r[0] === from && r[1] === to ? r : [from, Math.max(from, to)]))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [ref, count, active])
  return range
}

function Cover({ c, albumId, size }: { c: Catalogue; albumId: string; size: number }) {
  const url = useCover(c.albums[albumId]?.cover)
  return url ? <img className="qp-cover" src={url} alt="" width={size} height={size} draggable={false} /> : <span className="qp-cover qp-cover-empty" aria-hidden />
}

const PLAYED_KEY = 'pelagic.queue.played.v1'
const readShowPlayed = () => {
  try {
    return localStorage.getItem(PLAYED_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Already played: the queue rows before the current track, oldest first, so the most recent sits
 * right above "now playing". Own scroll area (max ~30% of the panel), pinned to the bottom while
 * playback moves on. Click a row to play it again, × to drop it. Collapsible (remembered).
 */
function PlayedSection({ c, ids, active }: { c: Catalogue; ids: string[]; active: boolean }) {
  const [show, setShow] = useState(readShowPlayed)
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [from, to] = useListWindow(listRef, ids.length, active && show)
  const total = useMemo(() => ids.reduce((s, id) => s + (c.tracks[id]?.duration ?? 0), 0), [ids, c])

  const toggle = () => {
    const v = !show
    setShow(v)
    stick.current = true
    try {
      localStorage.setItem(PLAYED_KEY, v ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }

  // keep the most recent row in view as tracks finish (unless scrolled up to look back)
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [ids.length, show, active])

  const focusRow = (i: number) =>
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-abs="${i}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        el.focus({ preventScroll: true })
      }
    })
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      playerStore.jump(i)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      playerStore.remove(i)
      focusRow(Math.min(i, ids.length - 2))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(i + (e.key === 'ArrowDown' ? 1 : -1))
    }
  }

  return (
    <div className={`qp-played ${show ? 'is-open' : ''}`}>
      <button type="button" className="qp-rule qp-rule-btn" aria-expanded={show} onClick={toggle} title={show ? 'Hide played tracks' : 'Show played tracks'}>
        <span className="qp-rule-l t-mono">PLAYED</span>
        <span className="qp-rule-line" />
        <span className="qp-rule-r t-mono">
          {String(ids.length).padStart(2, '0')} · {fmtTotal(total)}
        </span>
        <span className="qp-rule-chev" aria-hidden>
          <Icon name="chevD" />
        </span>
      </button>
      {show && (
        <div
          className="qp-list qp-played-list"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
          }}
        >
          <div className="qp-list-in" style={{ height: ids.length * ROW }}>
            {ids.slice(from, to).map((id, k) => {
              const i = from + k
              const t = c.tracks[id]
              return (
                <div
                  key={`${i}:${id}`}
                  data-abs={i}
                  className="qp-row is-played"
                  style={{ top: i * ROW }}
                  tabIndex={0}
                  role="button"
                  aria-label={t ? `Played: ${t.title} by ${t.artist}. Enter to play again, Delete to remove.` : 'Missing track'}
                  onClick={() => playerStore.jump(i)}
                  onKeyDown={onKey(i)}
                >
                  <span className="qp-handle qp-grip qp-played-n t-mono" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {t ? <Cover c={c} albumId={t.albumId} size={40} /> : <span className="qp-cover qp-cover-empty" />}
                  <div className="qp-text">
                    <div className="qp-t">{t?.title ?? 'Missing track'}</div>
                    <div className="qp-a">{t?.artist ?? 'No longer in your library'}</div>
                  </div>
                  <span className="qp-d t-mono">{t?.duration ? formatTime(t.duration) : '--:--'}</span>
                  <button
                    type="button"
                    className="qp-act"
                    title="Play again"
                    aria-label="Play again"
                    onClick={(e) => {
                      e.stopPropagation()
                      playerStore.jump(i)
                    }}
                  >
                    <Icon name="playF" />
                  </button>
                  <button
                    type="button"
                    className="qp-act qp-act-x"
                    title="Remove"
                    aria-label="Remove from queue"
                    onClick={(e) => {
                      e.stopPropagation()
                      playerStore.remove(i)
                    }}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface DragState {
  from: number
  over: number | null
  after: boolean
}

export function QueuePanel() {
  const ui = useNowPlayingUi()
  const p = usePlayer()
  const { data } = useLibrary()
  const toast = useToast()
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const open = ui.queue && p.index >= 0
  const overNp = ui.open
  const currentId = p.index >= 0 ? p.queue[p.index] : null
  const current = currentId ? data?.tracks[currentId] : undefined
  const base = p.index + 1
  const upcoming = useMemo(() => (p.index >= 0 ? p.queue.slice(p.index + 1) : []), [p.queue, p.index])
  const played = useMemo(() => (p.index > 0 ? p.queue.slice(0, p.index) : []), [p.queue, p.index])
  const total = useMemo(() => upcoming.reduce((s, id) => s + (data?.tracks[id]?.duration ?? 0), 0), [upcoming, data])
  const [from, to] = useListWindow(listRef, upcoming.length, open)
  const ctx = contextLine(p.context)
  const cleared = playerStore.clearedUpcoming()

  const close = () => nowPlayingStore.closeQueue()

  // toasts step left of the panel while it's open
  useEffect(() => {
    if (!open) return
    document.documentElement.setAttribute('data-qp', '')
    return () => document.documentElement.removeAttribute('data-qp')
  }, [open])

  const onClear = () => {
    const removed = playerStore.clearUpcoming()
    if (!removed.length) return
    toast.show({
      icon: 'queue',
      text: `Cleared ${removed.length} upcoming track${removed.length === 1 ? '' : 's'}.`,
      meta: 'QUEUE',
      action: { label: 'Undo', onClick: () => playerStore.restoreUpcoming() },
    })
  }

  /* drag to reorder (absolute queue indices) */
  const onDragStart = (abs: number) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(abs))
    setDrag({ from: abs, over: null, after: false })
  }
  const onDragOver = (abs: number) => (e: DragEvent) => {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    if (drag.over !== abs || drag.after !== after) setDrag({ ...drag, over: abs, after })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    if (drag && drag.over !== null) {
      const pos = drag.over + (drag.after ? 1 : 0)
      const target = pos > drag.from ? pos - 1 : pos
      playerStore.move(drag.from, Math.max(base, target))
    }
    setDrag(null)
  }

  const onRowKey = (abs: number) => (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const last = p.queue.length - 1
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      playerStore.jump(abs)
    } else if (e.altKey && e.key === 'ArrowUp' && abs > base) {
      e.preventDefault()
      playerStore.move(abs, abs - 1)
      focusRow(abs - 1)
    } else if (e.altKey && e.key === 'ArrowDown' && abs < last) {
      e.preventDefault()
      playerStore.move(abs, abs + 1)
      focusRow(abs + 1)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      playerStore.remove(abs)
      focusRow(Math.min(abs, last - 1))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(abs + (e.key === 'ArrowDown' ? 1 : -1))
    }
  }
  const focusRow = (abs: number) =>
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-abs="${abs}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        el.focus({ preventScroll: true })
      }
    })

  return (
    <>
      <div className={`qp-scrim pg-anim ${overNp ? 'is-over-np' : ''} ${open ? 'is-open' : ''}`} onClick={close} aria-hidden />
      <aside className={`qp pg-anim ${overNp ? 'is-over-np' : ''} ${open ? 'is-open' : ''}`} aria-label="Queue" aria-hidden={!open} inert={!open}>
        <div className="qp-head">
          <div className="qp-head-text">
            <div className="qp-kicker t-mono" title={`${ctx.kicker} · ${ctx.label}`}>
              {ctx.kicker} · {ctx.label.toUpperCase()}
            </div>
            <h2 className="qp-title">Queue</h2>
          </div>
          <div className="qp-tools">
            <button type="button" className="qp-tool qp-tool-sq" title="Shuffle upcoming" aria-label="Shuffle upcoming" disabled={upcoming.length < 2} onClick={() => playerStore.shuffleUpcoming()}>
              <Icon name="shuffle" />
            </button>
            <button type="button" className="qp-tool qp-tool-text" disabled={!upcoming.length} onClick={onClear}>
              Clear
            </button>
            <button type="button" className="qp-tool qp-tool-x" title="Close" aria-label="Close queue" onClick={close}>
              <Icon name="x" />
            </button>
          </div>
        </div>

        {played.length > 0 && data && <PlayedSection c={data} ids={played} active={open} />}

        {current && data && (
          <div className="qp-now">
            <span className="qp-handle">
              <Eq playing={p.playing} />
            </span>
            <Cover c={data} albumId={current.albumId} size={42} />
            <div className="qp-text">
              <div className="qp-t is-now">{current.title}</div>
              <div className="qp-a">{current.artist}</div>
            </div>
            <span className="qp-d t-mono">{formatTime(p.position)}</span>
          </div>
        )}

        <div className="qp-rule">
          <span className="qp-rule-l t-mono">NEXT UP</span>
          <span className="qp-rule-line" />
          <span className="qp-rule-r t-mono">
            {String(upcoming.length).padStart(2, '0')} · {fmtTotal(total) || '00:00'}
          </span>
        </div>

        {upcoming.length > 0 && data ? (
          <div className="qp-list" ref={listRef} onDragOver={(e) => drag && e.preventDefault()} onDrop={onDrop}>
            <div className="qp-list-in" style={{ height: upcoming.length * ROW }}>
              {upcoming.slice(from, to).map((id, k) => {
                const i = from + k
                const abs = base + i
                const t = data.tracks[id]
                const isDrag = drag?.from === abs
                const lineTop = drag?.over === abs && !drag.after && !isDrag
                const lineBot = drag?.over === abs && drag.after && !isDrag
                return (
                  <div
                    key={`${abs}:${id}`}
                    data-abs={abs}
                    className={`qp-row ${isDrag ? 'is-drag' : ''}`}
                    style={{ top: i * ROW }}
                    draggable
                    tabIndex={0}
                    role="button"
                    aria-label={t ? `${t.title} by ${t.artist}. Enter to play, Alt+arrows to move, Delete to remove.` : 'Missing track'}
                    onDragStart={onDragStart(abs)}
                    onDragOver={onDragOver(abs)}
                    onDragEnd={() => setDrag(null)}
                    onClick={() => playerStore.jump(abs)}
                    onKeyDown={onRowKey(abs)}
                  >
                    {lineTop && <span className="qp-drop qp-drop-top" />}
                    {lineBot && <span className="qp-drop qp-drop-bot" />}
                    <span className="qp-handle qp-grip" aria-hidden>
                      <Icon name="drag" />
                    </span>
                    {t ? <Cover c={data} albumId={t.albumId} size={40} /> : <span className="qp-cover qp-cover-empty" />}
                    <div className="qp-text">
                      <div className="qp-t">{t?.title ?? 'Missing track'}</div>
                      <div className="qp-a">{t?.artist ?? 'No longer in your library'}</div>
                    </div>
                    <span className="qp-d t-mono">{t?.duration ? formatTime(t.duration) : '--:--'}</span>
                    <button
                      type="button"
                      className="qp-act"
                      title="Play next"
                      aria-label="Play next"
                      disabled={abs === base}
                      onClick={(e) => {
                        e.stopPropagation()
                        playerStore.move(abs, base)
                      }}
                    >
                      <Icon name="chevU" />
                    </button>
                    <button
                      type="button"
                      className="qp-act qp-act-x"
                      title="Remove"
                      aria-label="Remove from queue"
                      onClick={(e) => {
                        e.stopPropagation()
                        playerStore.remove(abs)
                      }}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="qp-empty">
            <div className="qp-empty-mark" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <div className="qp-empty-t">Still water after this one.</div>
            <div className="qp-empty-b">
              {p.repeat === 'one'
                ? `Nothing is queued. Repeat one keeps “${current?.title ?? 'this track'}” going.`
                : p.repeat === 'all'
                  ? `Nothing is queued. With repeat on, “${current?.title ?? 'this track'}” plays again.`
                  : `Nothing is queued. Playback stops when “${current?.title ?? 'this track'}” ends.`}
            </div>
            {cleared?.length ? (
              <button type="button" className="qp-restore" onClick={() => playerStore.restoreUpcoming()}>
                Restore queue
              </button>
            ) : null}
          </div>
        )}

        <div className="qp-foot t-mono">DRAG TO REORDER · ↑ PLAY NEXT · × REMOVE</div>
      </aside>
    </>
  )
}
