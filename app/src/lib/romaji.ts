/**
 * Lyrics romaji (Nov 2026): Japanese lyric lines in Hepburn romaji, shown under each line.
 *
 * Kanji need a ~18 MB dictionary to read, so the conversion runs on the server
 * (`POST /api/romaji/lines`, firebase/functions/src/romaji.ts). Each song's result is kept in
 * IndexedDB (`kv`, key `romaji:<hash of the lines>`) — a song is converted once, and its romaji then
 * works offline. Offline with nothing cached: no romaji line, the lyrics show as before.
 *
 * Only lyrics with kana count as Japanese (kanji-only lines could be Chinese).
 *
 * Korean (Hangul) is romanised right here in the app (lib/hangul.ts, Revised Romanization): no
 * server, no cache needed, works offline. Lyrics mixing both get each line in its own system.
 */
import { useEffect, useMemo, useState } from 'react'
import { idbGet, idbSet } from './idb'
import { hash } from './mixing'
import { isNative } from '../native/bridge'
import { HANGUL, romanizeKorean } from './hangul'
import { apiHeaders } from '../sync/apiAuth'

const API_BASE: string = isNative ? ((import.meta.env.VITE_PELAGIC_API as string | undefined) ?? 'https://material-music-app.web.app/') : import.meta.env.BASE_URL

const KANA = /[぀-ゟ゠-ヿ]/
const JA = /[぀-ヿ㐀-䶿一-鿿々]/

/** Lyrics are Japanese when some line has kana in it. */
export const isJapanese = (lines: readonly string[]) => lines.some((l) => KANA.test(l))
/** Which script the lyrics need romanising from (null: neither Japanese nor Korean). */
export function lyricsScript(lines: readonly string[]): 'ja' | 'ko' | null {
  if (isJapanese(lines)) return 'ja'
  return lines.some((l) => HANGUL.test(l)) ? 'ko' : null
}
/** Korean lines romanised in the app ("" for lines without Hangul). */
const koreanLines = (lines: readonly string[]) => lines.map((l) => romanizeKorean(l))
/** Fill in Korean lines the Japanese pass left empty (lyrics with both). */
const withKorean = (lines: readonly string[], ja: string[]) => ja.map((r, i) => r || romanizeKorean(lines[i]))

/** This line has something to romanise. */
export const hasJapanese = (line: string) => JA.test(line)

const memo = new Map<string, Promise<string[] | null>>()

function keyOf(lines: readonly string[]) {
  const text = lines.join('\n')
  return `romaji:${hash(text).toString(36)}:${text.length}`
}

async function fetchRomaji(lines: readonly string[]): Promise<string[] | null> {
  const key = keyOf(lines)
  const cached = await idbGet<string[]>('kv', key).catch(() => undefined)
  if (Array.isArray(cached) && cached.length === lines.length) return cached
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null
  const res = await fetch(`${API_BASE}api/romaji/lines`, {
    method: 'POST',
    headers: await apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ lines }),
  })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error(`romaji ${res.status}`)
  const j = (await res.json()) as { lines?: unknown }
  if (!Array.isArray(j.lines) || j.lines.length !== lines.length) throw new Error('romaji: bad answer')
  const out = j.lines.map((l) => (typeof l === 'string' ? l : ''))
  void idbSet('kv', key, out)
  return out
}

export type RomajiState = { status: 'off' } | { status: 'loading' } | { status: 'ready'; lines: string[] } | { status: 'unavailable' }

/**
 * The romaji for these lyric lines (same order; "" where a line has nothing Japanese). `off` when
 * turned off or the lyrics aren't Japanese.
 */
export function useRomaji(lines: readonly string[] | null, on: boolean): RomajiState {
  const script = lines && on ? lyricsScript(lines) : null
  const korean = useMemo(() => (script === 'ko' && lines ? koreanLines(lines) : null), [script, lines])
  const japanese = script === 'ja'
  const key = japanese ? keyOf(lines!) : null
  const [state, setState] = useState<{ key: string | null; value: RomajiState }>({ key: null, value: { status: 'off' } })
  useEffect(() => {
    if (!key || !lines) return
    let live = true
    let p = memo.get(key)
    if (!p) {
      p = fetchRomaji(lines)
      memo.set(key, p)
      // a failure isn't remembered: the next look tries again
      p.catch(() => memo.delete(key))
      void p.then((r) => r || memo.delete(key))
    }
    setState((s) => (s.key === key && s.value.status === 'ready' ? s : { key, value: { status: 'loading' } }))
    p.then(
      (r) => live && setState({ key, value: r ? { status: 'ready', lines: withKorean(lines, r) } : { status: 'unavailable' } }),
      () => live && setState({ key, value: { status: 'unavailable' } }),
    )
    return () => {
      live = false
    }
    // lines are identified by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (korean) return { status: 'ready', lines: korean }
  if (!japanese) return { status: 'off' }
  return state.key === key ? state.value : { status: 'loading' }
}
