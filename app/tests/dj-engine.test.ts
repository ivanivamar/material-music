/**
 * DJ engine guard rails (Nov 2026). Run with `npm test`.
 *
 * These pin down what a session promises, not the exact songs, so the engine can be refactored
 * without rewriting them: sizes, no repeats, variety (album / artist caps, no artist back to back,
 * sessions that differ), each type's pool, the shortage note, the liked-song rules and learning.
 * Every run uses a seeded RNG, so a failure always reproduces.
 *
 * To park a known bug without failing `npm test`, mark its test `{ todo: 'why' }` (it still runs
 * and is reported); drop the `todo` once it's fixed.
 *
 * The libraries are synthetic but shaped like the real one: history started recently (most songs
 * never played), a few huge discographies, and niche genres / decades owned by one artist, the
 * shapes that once made Never played sessions all one artist.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLibrary,
  buildSession,
  featureScores,
  outcomeValue,
  seeded,
  isNever,
  isForgotten,
  isNew,
  MIN_SIZE,
  MAX_SIZE,
  FORGOTTEN_MS,
  type DjLibrary,
  type DjType,
  type Mode,
  type Outcome,
  type SessionPlan,
  type Theme,
} from '../src/dj/engine.ts'

/**
 * Sessions where one artist may lead by design: Artist sets, and New additions (a freshly added
 * album is the point; the line even says "mostly <artist>").
 */
const LEADS_BY_DESIGN = new Set(['artist', 'new'])

const DAY = 86_400_000
const NOW = Date.parse('2026-11-06T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

/* ── Fixture ────────────────────────────────────────── */

interface ArtistSpec {
  name: string
  albums: number
  perAlbum: number
  genres?: string[]
  year?: number
  /** ms */
  addedAt?: number
}

interface Fixture {
  artists: ArtistSpec[]
  /** share of songs played in the last weeks (history is young) */
  playedShare?: number
  /** share of songs last played over six months ago */
  forgottenShare?: number
  /** share of songs liked */
  likedShare?: number
  seed?: number
}

const GENRES = ['Rock', 'Pop', 'Indie', 'Electronic', 'Hip Hop', 'Metal', 'Jazz', 'Folk']

function makeLibrary(f: Fixture): DjLibrary {
  const rng = seeded(f.seed ?? 42)
  const tracks: Parameters<typeof buildLibrary>[0]['tracks'] extends Iterable<infer T> ? T[] : never = []
  const albums: Record<string, { id: string; title: string; year?: number }> = {}
  const genreOf: Record<string, string[]> = {}
  const plays: { trackId: string; at: number }[] = []
  const liked = new Map<string, number>()
  let n = 0
  for (const a of f.artists) {
    for (let al = 0; al < a.albums; al++) {
      const albumId = `${a.name}#${al}`
      albums[albumId] = { id: albumId, title: albumId, year: a.year ?? 1965 + Math.floor(rng() * 60) }
      genreOf[albumId] = a.genres ?? [GENRES[Math.floor(rng() * GENRES.length)]]
      for (let t = 0; t < a.perAlbum; t++) {
        const id = `t${n++}`
        tracks.push({ id, title: `${a.name} ${al}.${t}`, artist: a.name, artistId: a.name, albumId, track: t + 1, duration: 200, addedAt: iso(a.addedAt ?? NOW - 400 * DAY) })
        const r = rng()
        if (r < (f.playedShare ?? 0.15)) plays.push({ trackId: id, at: (NOW - (1 + rng() * 20) * DAY) / 1000 })
        else if (r < (f.playedShare ?? 0.15) + (f.forgottenShare ?? 0)) plays.push({ trackId: id, at: (NOW - FORGOTTEN_MS - (5 + rng() * 200) * DAY) / 1000 })
        if (rng() < (f.likedShare ?? 0)) liked.set(id, NOW - 50 * DAY)
      }
    }
  }
  return buildLibrary({ tracks, albums, genreOf: (id) => genreOf[id] ?? [], plays, liked, now: NOW })
}

/** 50 ordinary artists + the awkward shapes: one-artist genre, one-artist decade, a huge discography. */
function realisticArtists(seed = 1): ArtistSpec[] {
  const rng = seeded(seed)
  const out: ArtistSpec[] = []
  for (let i = 0; i < 50; i++) out.push({ name: `Artist ${i}`, albums: 1 + Math.floor(rng() * 3), perAlbum: 10, addedAt: rng() < 0.15 ? NOW - rng() * 25 * DAY : undefined })
  out.push({ name: 'Only J-Pop', albums: 8, perAlbum: 12, genres: ['J-Pop'], year: 2015 })
  out.push({ name: 'Only 70s', albums: 5, perAlbum: 10, genres: ['Rock'], year: 1972 })
  out.push({ name: 'Huge', albums: 15, perAlbum: 12, genres: ['Pop'] })
  return out
}

const REALISTIC = makeLibrary({ artists: realisticArtists(), playedShare: 0.15, forgottenShare: 0.1, likedShare: 0.08 })

/* ── Running the DJ ─────────────────────────────────── */

const mode = (types: DjType[], extra: Partial<Mode> = {}): Mode => ({ types, genres: [], endless: types.length === 4, ...extra })

interface Ran {
  plan: SessionPlan
  before: Set<string>
}

/** `runs` DJ runs of up to `sessions` sessions each, threaded like state/dj.ts does it. */
function simulate(lib: DjLibrary, m: Mode, { runs = 30, sessions = 6, seed = 1 } = {}): Ran[][] {
  const rng = seeded(seed)
  const out: Ran[][] = []
  for (let r = 0; r < runs; r++) {
    const used = new Set<string>()
    let last: Theme | null = null
    let lastSongs: string[] | undefined
    const run: Ran[] = []
    for (let s = 0; s < sessions; s++) {
      const before = new Set(used)
      const plan = buildSession(lib, m, { used, last, lastSongs, rng, n: s + 1 })
      if (!plan) break
      run.push({ plan, before })
      for (const id of plan.songs) used.add(id)
      last = plan.theme
      lastSongs = plan.songs
    }
    out.push(run)
  }
  return out
}

const track = (lib: DjLibrary, id: string) => {
  const t = lib.byId.get(id)
  assert.ok(t, `unknown song ${id}`)
  return t
}

function countBy<T>(xs: T[]): Map<T, number> {
  const m = new Map<T, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

const maxOf = (m: Map<unknown, number>) => Math.max(0, ...m.values())

const ALL_MODES: [string, Mode][] = [
  ['Never played', mode(['never'])],
  ['Forgotten', mode(['forgotten'])],
  ['New additions', mode(['new'])],
  ['Genre', mode(['genre'])],
  ['Endless', mode(['genre', 'never', 'forgotten', 'new'])],
]

/* ── Every session ──────────────────────────────────── */

describe('every session, every mode', () => {
  for (const [name, m] of ALL_MODES) {
    describe(name, () => {
      const runs = simulate(REALISTIC, m)
      const all = runs.flat()

      test('builds sessions', () => {
        assert.ok(all.length >= runs.length * 5, `only ${all.length} sessions`)
      })

      test(`has ${MIN_SIZE}–${MAX_SIZE} songs`, () => {
        for (const { plan } of all) assert.ok(plan.songs.length >= MIN_SIZE && plan.songs.length <= MAX_SIZE, `${plan.title}: ${plan.songs.length} songs`)
      })

      test('never plays a song twice in a run', () => {
        for (const run of runs) {
          const ids = run.flatMap((r) => r.plan.songs)
          assert.equal(new Set(ids).size, ids.length)
        }
      })

      test('never plays a song already used earlier in the run', () => {
        for (const { plan, before } of all) for (const id of plan.songs) assert.ok(!before.has(id))
      })

      test('max 2 songs per album, 3 per artist (Artist sets: 4 of their artist)', () => {
        for (const { plan } of all) {
          const ts = plan.songs.map((id) => track(REALISTIC, id))
          assert.ok(maxOf(countBy(ts.map((t) => t.albumId))) <= 2, `${plan.title}: album cap`)
          for (const [artist, n] of countBy(ts.map((t) => t.artistId))) {
            const cap = plan.theme.kind === 'artist' && artist === plan.theme.artistId ? 4 : 3
            assert.ok(n <= cap, `${plan.title}: ${n} songs by ${artist}`)
          }
        }
      })

      test('no artist twice in a row', () => {
        for (const { plan } of all) {
          const artists = plan.songs.map((id) => track(REALISTIC, id).artistId)
          for (let i = 1; i < artists.length; i++) assert.notEqual(artists[i], artists[i - 1], `${plan.title}: ${artists.join(' / ')}`)
        }
      })

      test('never the same session type twice in a row', () => {
        if (m.types.length === 1) return
        for (const run of runs) for (let i = 1; i < run.length; i++) assert.notEqual(run[i].plan.theme.kind, run[i - 1].plan.theme.kind)
      })

      test('has a title, a spoken line and learning features', () => {
        for (const { plan } of all) {
          assert.ok(plan.title.trim(), 'title')
          assert.ok(plan.line.trim(), 'line')
          assert.ok(plan.features.includes(`type:${plan.theme.kind}`), 'type feature')
        }
      })

      test('the spoken line never says how many songs', () => {
        for (const { plan } of all) {
          const n = plan.songs.length
          assert.ok(!new RegExp(`\\b(${n}|${['six', 'seven', 'eight', 'nine'][n - 6]}) (songs|tracks)\\b`, 'i').test(plan.line), plan.line)
        }
      })
    })
  }
})

/* ── Variety (the Nov 2026 bug) ─────────────────────── */

describe('artist variety', () => {
  for (const [name, m] of ALL_MODES) {
    test(`${name}: no session is half one artist (except Artist sets / New additions)`, () => {
      for (const { plan } of simulate(REALISTIC, m).flat()) {
        if (LEADS_BY_DESIGN.has(plan.theme.kind)) continue
        const top = maxOf(countBy(plan.songs.map((id) => track(REALISTIC, id).artistId)))
        assert.ok(top < plan.songs.length / 2, `${plan.title}: ${top} of ${plan.songs.length} by one artist`)
      }
    })

    test(`${name}: back-to-back sessions share few artists`, () => {
      let shared = 0
      let pairs = 0
      for (const run of simulate(REALISTIC, m)) {
        for (let i = 1; i < run.length; i++) {
          if (LEADS_BY_DESIGN.has(run[i].plan.theme.kind) || LEADS_BY_DESIGN.has(run[i - 1].plan.theme.kind)) continue
          const prev = new Set(run[i - 1].plan.songs.map((id) => track(REALISTIC, id).artistId))
          shared += new Set(run[i].plan.songs.map((id) => track(REALISTIC, id).artistId).filter((a) => prev.has(a))).size
          pairs++
        }
      }
      if (!pairs) return
      assert.ok(shared / pairs < 0.5, `on average ${(shared / pairs).toFixed(2)} artists carried over`)
    })
  }

  test('Never played: a huge discography does not take over across a run', () => {
    // "Huge" owns ~13 % of the library; it should not show up in most sessions
    const all = simulate(REALISTIC, mode(['never'])).flat()
    const withHuge = all.filter(({ plan }) => plan.songs.some((id) => track(REALISTIC, id).artistId === 'Huge')).length
    assert.ok(withHuge / all.length < 0.5, `Huge in ${withHuge} of ${all.length} sessions`)
  })

  test('a genre or decade owned by one artist never becomes a whole session', () => {
    // the original bug: Never played · 2010s j-pop = one artist, nine songs
    for (const [, m] of ALL_MODES)
      for (const { plan } of simulate(REALISTIC, m, { seed: 7 }).flat()) {
        if (plan.theme.kind === 'artist') continue
        const n = plan.songs.filter((id) => ['Only J-Pop', 'Only 70s'].includes(track(REALISTIC, id).artistId)).length
        assert.ok(n <= 3, `${plan.title}: ${n} songs by a one-artist genre / decade`)
      }
  })

  test('picking a one-artist genre yourself still mixes in neighbours before repeating that artist', () => {
    const lib = makeLibrary({
      artists: [
        { name: 'Solo', albums: 4, perAlbum: 10, genres: ['J-Pop', 'Pop'] },
        ...Array.from({ length: 12 }, (_, i) => ({ name: `Pop ${i}`, albums: 2, perAlbum: 8, genres: ['Pop'] })),
      ],
    })
    for (const { plan } of simulate(lib, mode(['genre'], { genres: ['j pop'] }), { runs: 10, sessions: 3 }).flat()) {
      const solo = plan.songs.filter((id) => track(lib, id).artistId === 'Solo').length
      assert.ok(solo <= 3, `${plan.title}: ${solo} songs by Solo`)
    }
  })
})

/* ── Pools ──────────────────────────────────────────── */

describe('each type plays its own songs', () => {
  test('Never played: only unplayed songs while there are plenty', () => {
    for (const { plan } of simulate(REALISTIC, mode(['never'])).flat()) {
      assert.equal(plan.theme.kind, 'never')
      for (const id of plan.songs) assert.ok(isNever(track(REALISTIC, id)), `${plan.title}: played song`)
      assert.equal(plan.note, null)
    }
  })

  test('Forgotten: only forgotten songs while there are plenty', () => {
    for (const { plan } of simulate(REALISTIC, mode(['forgotten'])).flat()) for (const id of plan.songs) assert.ok(isForgotten(track(REALISTIC, id), NOW), `${plan.title}: not forgotten`)
  })

  test('Forgotten with no history old enough: borrows never-played songs', () => {
    const lib = makeLibrary({ artists: realisticArtists(), playedShare: 0.2, forgottenShare: 0 })
    for (const { plan } of simulate(lib, mode(['forgotten']), { runs: 5 }).flat()) {
      assert.equal(plan.theme.kind, 'forgotten')
      for (const id of plan.songs) assert.ok(isNever(track(lib, id)))
    }
  })

  test('New additions: recent songs first', () => {
    for (const { plan } of simulate(REALISTIC, mode(['new']), { runs: 10, sessions: 2 }).flat()) {
      const fresh = plan.songs.filter((id) => isNew(track(REALISTIC, id), NOW, 90)).length
      assert.ok(fresh >= plan.songs.length / 2 || plan.note, `${plan.title}: only ${fresh} new songs and no note`)
    }
  })

  test('Genre (picked): every song is in one of the picked genres', () => {
    for (const { plan } of simulate(REALISTIC, mode(['genre'], { genres: ['rock', 'jazz'] }), { runs: 10, sessions: 3 }).flat()) {
      assert.deepEqual([...(plan.theme.genres ?? [])].sort(), ['jazz', 'rock'])
      if (plan.note) continue
      for (const id of plan.songs) assert.ok(track(REALISTIC, id).gkeys.some((k) => k === 'rock' || k === 'jazz'))
    }
  })

  test('a narrowed session (era / genre) keeps its promise in the title', () => {
    for (const [, m] of ALL_MODES)
      for (const { plan } of simulate(REALISTIC, m).flat()) {
        if (plan.theme.kind === 'decade' || plan.note) continue
        const d = plan.theme.decade
        if (d) for (const id of plan.songs) assert.equal(Math.floor((track(REALISTIC, id).year ?? 0) / 10) * 10, d, `${plan.title}: off-era song`)
      }
  })
})

/* ── Running out ────────────────────────────────────── */

describe('running out', () => {
  test('two artists left: sessions still come, without a "running low" note', () => {
    const lib = makeLibrary({ artists: [{ name: 'X', albums: 3, perAlbum: 10 }, { name: 'Y', albums: 3, perAlbum: 10 }], playedShare: 0 })
    const [run] = simulate(lib, mode(['never']), { runs: 1, sessions: 50 })
    assert.equal(new Set(run.flatMap((r) => r.plan.songs)).size, 60, 'plays the whole library')
    for (const { plan } of run) assert.equal(plan.note, null, plan.title)
  })

  test('Never played running out: mixes in played songs and says so', () => {
    const lib = makeLibrary({ artists: realisticArtists(3), playedShare: 0.97, forgottenShare: 0 })
    const notes = simulate(lib, mode(['never']), { runs: 5, sessions: 8 })
      .flat()
      .filter(({ plan }) => plan.note)
    assert.ok(notes.length > 0, 'expected a shortage note')
    for (const { plan } of notes) assert.match(plan.note!, /never-played/)
  })

  test('nothing left: buildSession returns null', () => {
    const lib = makeLibrary({ artists: [{ name: 'X', albums: 1, perAlbum: 5 }] })
    assert.equal(buildSession(lib, mode(['never']), { used: new Set(lib.tracks.map((t) => t.id)), rng: seeded(1) }), null)
  })
})

/* ── Liked songs ────────────────────────────────────── */

describe('liked songs', () => {
  test('Liked songs sessions (Endless) are only hearts', () => {
    const lib = makeLibrary({ artists: realisticArtists(), likedShare: 0.3 })
    const liked = simulate(lib, mode(['genre', 'never', 'forgotten', 'new']), { runs: 60 })
      .flat()
      .filter(({ plan }) => plan.theme.kind === 'liked' && !plan.note)
    assert.ok(liked.length > 0, 'no Liked songs session came up')
    for (const { plan } of liked) for (const id of plan.songs) assert.ok(track(lib, id).liked > 0)
  })

  test('Forgotten digs up hearts first', () => {
    const lib = makeLibrary({ artists: realisticArtists(), playedShare: 0.05, forgottenShare: 0.6, likedShare: 0.1 })
    const all = simulate(lib, mode(['forgotten']), { runs: 20, sessions: 3 }).flat()
    const share = all.reduce((s, { plan }) => s + plan.songs.filter((id) => track(lib, id).liked).length / plan.songs.length, 0) / all.length
    assert.ok(share > 0.25, `hearts were ${(share * 100).toFixed(0)} % of Forgotten sessions (library: ~10 %)`)
  })
})

/* ── Determinism and learning ───────────────────────── */

describe('determinism', () => {
  test('same seed, same sessions', () => {
    const a = simulate(REALISTIC, mode(['genre', 'never', 'forgotten', 'new']), { runs: 3, seed: 9 })
    const b = simulate(REALISTIC, mode(['genre', 'never', 'forgotten', 'new']), { runs: 3, seed: 9 })
    assert.deepEqual(
      a.map((r) => r.map((x) => x.plan)),
      b.map((r) => r.map((x) => x.plan)),
    )
  })
})

describe('learning', () => {
  const o = (over: Partial<Outcome>): Outcome => ({ id: 'x', at: NOW, kind: 'never', features: ['type:never'], played: 6, skipped: 0, sessionSkip: null, saved: 0, ...over })

  test('outcome values', () => {
    assert.equal(outcomeValue(o({})), 1)
    assert.equal(outcomeValue(o({ sessionSkip: 0 })), -1)
    assert.equal(outcomeValue(o({ sessionSkip: 4 })), -0.3)
    assert.ok(Math.abs(outcomeValue(o({ saved: 2 })) - 1.6) < 1e-9)
  })

  test('scores halve every 60 days', () => {
    const s = featureScores([o({ at: NOW - 60 * DAY })], NOW)
    assert.ok(Math.abs(s.get('type:never')! - 0.5) < 1e-9)
  })

  test('a liked type comes up more often', () => {
    const count = (scores: Map<string, number>) => {
      const rng = seeded(5)
      let n = 0
      for (let i = 0; i < 400; i++) if (buildSession(REALISTIC, mode(['genre', 'never', 'forgotten', 'new']), { used: new Set(), scores, rng })?.theme.kind === 'never') n++
      return n
    }
    const loved = featureScores(Array.from({ length: 5 }, () => o({})), NOW)
    assert.ok(count(loved) > count(new Map()) * 1.3)
  })
})
