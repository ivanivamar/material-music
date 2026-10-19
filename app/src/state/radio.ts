/**
 * Radio (step 26): an endless queue seeded from a song, an album or an artist.
 *
 * A normal queue (the queue panel works, unlike DJ mode), context `{ kind: 'radio', id:
 * 'radio:<type>:<id>', label }`: first the seed song (song radio) or a strong track of the seed, then
 * 10 picks; when 5 or fewer are left, the next 10 are added. No song twice in a run. Picks come from
 * lib/mixing.ts radioBatch() over the DJ's library facts (state/dj djLibrary: current plays, early-skip
 * penalties, and on the phone offline only downloaded songs). Neighbour artists come from Deezer's
 * related artists (lib/deezer.ts, cached) or, without them, shared genres.
 *
 * Starting a radio replaces the queue like playing an album does (shuffle and repeat off), which also
 * stops the DJ. Playing anything else ends the radio. The run is kept in localStorage so a reload
 * keeps refilling.
 */
import { requestRelated, relatedOf } from '../lib/deezer'
import { neighbourWeights, parseRadioId, radioBatch, radioId, radioOpener, radioProfile, rngFor, type RadioSeed } from '../lib/mixing'
import { djLibrary } from './dj'
import { libraryStore } from './library'
import { radioTitle } from './mixes'
import { playerStore } from './player'
import { onAccountReset } from './session'

const KEY = 'pelagic.radio.v1'
const BATCH = 10
const REFILL_AT = 5

interface RadioRun {
  id: string
  seed: RadioSeed
  label: string
  used: string[]
  seedArtist: string
  seedArtistN: number
  startedAt: number
  /** nothing left to add */
  done?: boolean
}

function load(): RadioRun | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RadioRun) : null
  } catch {
    return null
  }
}
let run: RadioRun | null = load()
function save() {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

function nextBatch(r: RadioRun, size: number): string[] {
  const c = libraryStore.get().data
  const lib = djLibrary()
  if (!c || !lib) return []
  const prof = radioProfile(lib, r.seed)
  if (!prof) return []
  const used = new Set([...r.used, ...playerStore.get().queue])
  const rng = rngFor(r.id, String(r.startedAt), String(r.used.length), String(Math.random()))
  const picks = radioBatch(lib, prof, {
    used,
    neighbours: neighbourWeights(lib, prof, relatedOf(c, prof.artistId)),
    size,
    rng,
    runSoFar: r.used.length,
    seedArtistSoFar: r.seedArtistN,
  })
  r.used = [...r.used, ...picks.map((t) => t.id)].slice(-2000)
  r.seedArtistN += picks.filter((t) => t.artistId === prof.artistId).length
  return picks.map((t) => t.id)
}

export const radioStore = {
  /** The radio playing now (its context is in the player), or null. */
  active(): RadioRun | null {
    const ctx = playerStore.get().context
    return run && ctx?.kind === 'radio' && ctx.id === run.id ? run : null
  },

  /** Start a radio: replaces the queue and plays. Returns false when there's nothing to play. */
  start(seed: RadioSeed): boolean {
    const c = libraryStore.get().data
    const lib = djLibrary()
    if (!c || !lib) return false
    const prof = radioProfile(lib, seed)
    const t = radioTitle(c, seed)
    if (!prof || !t) return false
    const id = radioId(seed)
    const r: RadioRun = { id, seed, label: t.name, used: [], seedArtist: prof.artistId, seedArtistN: 0, startedAt: Date.now() }
    const first = radioOpener(prof, rngFor(id, String(r.startedAt)))
    r.used = [first.id]
    r.seedArtistN = first.artistId === prof.artistId ? 1 : 0
    run = r
    const rest = nextBatch(r, BATCH)
    save()
    playerStore.playDj([first.id, ...rest], { kind: 'radio', id, label: t.name })
    // Deezer's neighbours for the next picks (the first ones may be genre-only)
    void requestRelated(c, prof.artistId)
    return true
  },

  /** Seed of a radio context id (Jump back in). */
  startById(id: string): boolean {
    const seed = parseRadioId(id)
    return seed ? radioStore.start(seed) : false
  },
}

let busy = false
function follow() {
  if (busy) return
  const p = playerStore.get()
  if (!run) return
  if (p.context?.kind !== 'radio' || p.context.id !== run.id) {
    // something else replaced the queue: the radio is over
    if (p.index >= 0 || p.context?.kind !== 'radio') {
      run = null
      save()
    }
    return
  }
  if (run.done || p.queue.length - p.index - 1 > REFILL_AT) return
  busy = true
  try {
    const more = nextBatch(run, BATCH)
    save()
    if (more.length) playerStore.addToQueue(more)
    else run.done = true
  } finally {
    busy = false
  }
}

let started = false
export function initRadio() {
  if (started) return
  started = true
  playerStore.subscribe(follow)
}

onAccountReset(() => {
  run = null
  save()
})
