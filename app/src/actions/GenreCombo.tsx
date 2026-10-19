/**
 * Genre dropdown (Oct 19): a text field with its own list of the library's genres — no browser
 * autocomplete / <datalist>. Used by Edit genre (GenreDialog) and the smart playlist genre rule.
 *
 *   [ Metal|                         ▾ ]
 *   ┌───────────────────────────────────┐
 *   │ Metalcore                 212 SONGS│   ← most songs first, filtered as you type
 *   │ Symphonic metal            48 SONGS│
 *   │ + Add “Metal”                      │   ← `allowNew`: a genre that isn't in the library yet
 *   └───────────────────────────────────┘
 *
 * Opens on focus / click / ↓; ↑ ↓ move, Enter picks, Esc closes (without closing the dialog), Tab
 * leaves. The list is portalled to <body> with fixed positioning so the dialog's scroll area can't
 * clip it, and flips above the field when there's no room below.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../design/icons'

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()

interface Props {
  value: string
  onChange: (v: string) => void
  /** a genre was picked from the list (or Enter on a typed one) */
  onPick: (g: string) => void
  genres: string[]
  /** songs per genre, shown on the right */
  counts?: Record<string, number>
  /** left out of the list (already chosen) */
  exclude?: string[]
  /** offer "Add “…”" for a typed genre that isn't in the list */
  allowNew?: boolean
  /** one value (smart rule): close the list after a pick */
  closeOnPick?: boolean
  className?: string
  inputClassName?: string
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>
}

type Item = { kind: 'genre'; name: string } | { kind: 'new'; name: string }

export function GenreCombo({ value, onChange, onPick, genres, counts, exclude = [], allowNew = false, closeOnPick = false, className, inputClassName, inputProps }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()

  const items = useMemo<Item[]>(() => {
    const ex = new Set(exclude.map(fold))
    const q = fold(value)
    const pool = genres.filter((g) => !ex.has(fold(g)))
    let shown = pool
    if (q) {
      const starts = pool.filter((g) => fold(g).startsWith(q))
      const word = pool.filter((g) => !fold(g).startsWith(q) && fold(g).split(' ').some((w) => w.startsWith(q)))
      const rest = pool.filter((g) => !fold(g).startsWith(q) && !fold(g).split(' ').some((w) => w.startsWith(q)) && fold(g).includes(q))
      shown = [...starts, ...word, ...rest]
    }
    const out: Item[] = shown.slice(0, 200).map((name) => ({ kind: 'genre', name }))
    const typed = value.trim()
    if (allowNew && typed && !genres.some((g) => fold(g) === q) && !ex.has(q)) out.push({ kind: 'new', name: typed })
    return out
  }, [genres, exclude, value, allowNew])

  // keep the highlighted row in range and in view
  const act = Math.min(active, Math.max(0, items.length - 1))
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${act}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [act, open])

  // place the list under (or above) the field
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const el = wrap.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const below = window.innerHeight - r.bottom - 12
      const above = r.top - 12
      const up = below < 180 && above > below
      const maxH = Math.max(120, Math.min(280, up ? above : below))
      setPos(up ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, maxH } : { left: r.left, width: r.width, top: r.bottom + 6, maxH })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // click elsewhere closes
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (wrap.current?.contains(t) || list.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [open])

  const pick = (it: Item) => {
    onPick(it.name)
    setActive(0)
    if (closeOnPick) setOpen(false)
    input.current?.focus()
  }

  return (
    <div ref={wrap} className={`gc ${open ? 'is-open' : ''} ${className ?? ''}`}>
      <input
        {...inputProps}
        ref={input}
        className={`gc-input ${inputClassName ?? ''}`}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && items[act] ? `${id}-${act}` : undefined}
        autoComplete="off"
        spellCheck={false}
        onFocus={(e) => {
          setOpen(true)
          inputProps?.onFocus?.(e)
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!open) setOpen(true)
            else setActive(Math.min(items.length - 1, act + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(0, act - 1))
          } else if (e.key === 'Enter' && open && items[act] && value.trim()) {
            // with nothing typed, Enter goes to the form (Save)
            e.preventDefault()
            pick(items[act])
          } else if (e.key === 'Escape' && open) {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          } else if (e.key === 'Tab') setOpen(false)
          inputProps?.onKeyDown?.(e)
        }}
      />
      <button type="button" className="gc-chev" tabIndex={-1} aria-label={open ? 'Close the genre list' : 'Show all genres'} onPointerDown={(e) => e.preventDefault()} onClick={() => {
        setOpen((o) => !o)
        input.current?.focus()
      }}>
        <Icon name="chevD" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={`${id}-list`}
            className="gc-list"
            role="listbox"
            style={{ left: pos.left, width: Math.max(pos.width, 220), top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
            onPointerDown={(e) => e.preventDefault()}
          >
            {items.length === 0 ? (
              <div className="gc-empty">{genres.length ? 'No genre matches' : 'No genres in the library yet'}</div>
            ) : (
              items.map((it, i) => (
                <div
                  key={`${it.kind}:${it.name}`}
                  id={`${id}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === act}
                  className={`gc-opt ${i === act ? 'is-active' : ''} ${it.kind === 'new' ? 'is-new' : ''}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(it)}
                >
                  {it.kind === 'new' ? (
                    <>
                      <span className="gc-plus">
                        <Icon name="plus" />
                      </span>
                      <span className="gc-name">Add “{it.name}”</span>
                    </>
                  ) : (
                    <>
                      <span className="gc-name">{it.name}</span>
                      {counts?.[it.name] != null && <span className="gc-n">{counts[it.name]} {counts[it.name] === 1 ? 'SONG' : 'SONGS'}</span>}
                    </>
                  )}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
