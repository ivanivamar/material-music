/**
 * Lyrics romaji (Nov 2026): `POST /api/romaji/lines` with `{ lines: string[] }` → `{ lines: string[] }`,
 * each Japanese line written in Hepburn romaji ("" for a line with nothing Japanese in it).
 *
 * Kanji need a dictionary to read, so this runs here rather than in the app: kuromoji (the IPA
 * dictionary, ~18 MB, loaded once per instance) splits a line into words with their readings, and
 * wanakana turns the katakana readings into romaji. Particles are written as they're said
 * (は → wa, へ → e, を → o), endings and auxiliaries stick to their word ("tabete imasu" style spacing
 * is kept simple: one space between words).
 *
 * Its own function (firebase.json rewrites /api/romaji/** here) because the dictionary needs more
 * memory than the `api` function has. The app caches each song's result, so a song is converted once.
 * Needs the `X-Pelagic: 1` header, like the other endpoints. Nothing is stored.
 */
import { onRequest } from 'firebase-functions/v2/https'
import kuromoji from 'kuromoji'
import { toRomaji } from 'wanakana'
import path from 'node:path'
import { createRequire } from 'node:module'
import { caller } from './api/guard.ts'

type Token = kuromoji.IpadicFeatures
let tokenizerP: Promise<kuromoji.Tokenizer<Token>> | null = null

function tokenizer() {
  tokenizerP ??= new Promise((resolve, reject) => {
    const req = createRequire(__filename)
    const dicPath = path.join(path.dirname(req.resolve('kuromoji/package.json')), 'dict')
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)))
  })
  // a failed load is tried again on the next request
  tokenizerP.catch(() => (tokenizerP = null))
  return tokenizerP
}

const JA = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ々〆ヵヶ]/
const KANA_ONLY = /^[぀-ヿー]+$/
const PUNCT = /^[\s、。，．・！？!?「」『』（）()\[\]【】〜~…‥：:；;,."'-]+$/

/** Japanese punctuation → ASCII, so the romaji line reads naturally. */
const punct = (s: string) =>
  s
    .replace(/[、，]/g, ',')
    .replace(/[。．]/g, '.')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/[「」『』]/g, '"')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[〜～]/g, '~')
    .replace(/…/g, '...')
    .replace(/・/g, ' ')
    .replace(/　/g, ' ')

/** Attaches to the word before it (verb endings, auxiliaries, suffixes, っ…). */
function sticks(t: Token): boolean {
  if (t.pos === '助動詞') return true
  if (t.pos === '名詞' && t.pos_detail_1 === '接尾') return true
  if (t.pos === '動詞' && (t.pos_detail_1 === '接尾' || t.pos_detail_1 === '非自立')) return true
  if (t.pos === '助詞' && t.pos_detail_1 === '接続助詞' && /^(て|で|ば)$/.test(t.surface_form)) return true
  return false
}

/** How a word is said, in katakana (the dictionary reading; unknown kana words: their own spelling). */
function kanaOf(t: Token): string | null {
  const s = t.surface_form
  if (t.reading && t.reading !== '*') return t.reading
  return KANA_ONLY.test(s) ? s : null
}

/** Particles as they're pronounced. */
const PARTICLE: Record<string, string> = { は: 'wa', へ: 'e', を: 'o' }

function lineRomaji(tk: kuromoji.Tokenizer<Token>, line: string): string {
  if (!JA.test(line)) return ''
  const out: string[] = []
  // the word being built, in katakana: endings that stick to it are added before it is converted,
  // so a small ッ at the end of one part doubles the next consonant (待っ + て → matte)
  let cur = ''
  const flush = () => {
    if (cur) out.push(toRomaji(cur).replace(/ー/g, '-'))
    cur = ''
  }
  for (const t of tk.tokenize(line)) {
    const s = t.surface_form
    if (PUNCT.test(s)) {
      flush()
      const p = punct(s).trim()
      if (p) out.push(`\u0000${p}`) // glued to the previous word
      continue
    }
    if (!JA.test(s)) {
      flush()
      if (s.trim()) out.push(s.trim())
      continue
    }
    if (t.pos === '助詞' && PARTICLE[s]) {
      flush()
      out.push(PARTICLE[s])
      continue
    }
    const kana = kanaOf(t)
    if (!kana) {
      flush()
      out.push(s)
      continue
    }
    if (cur && sticks(t)) cur += kana
    else {
      flush()
      cur = kana
    }
  }
  flush()
  return out
    .join(' ')
    .replace(/ \u0000/g, '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(^|[.!?"]\s*)([a-z])/, (_, a: string, b: string) => a + b.toUpperCase())
    .trim()
}

const NATIVE_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost'])
function cors(origin: string | undefined): Record<string, string> {
  if (!origin || !NATIVE_ORIGINS.has(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'x-pelagic, content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

export const romaji = onRequest({ region: 'europe-west1', memory: '1GiB', maxInstances: 2, timeoutSeconds: 60, invoker: 'public' }, async (req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  res.set(cors(origin))
  res.set('cache-control', 'no-store')
  if (req.method === 'OPTIONS') return void res.status(204).send('')
  if (req.method !== 'POST') return void res.status(405).json({ error: 'method_not_allowed' })
  if (req.headers['x-pelagic'] !== '1') return void res.status(403).json({ error: 'forbidden' })
  if (!(await caller(req.headers.authorization))) return void res.status(401).json({ error: 'unauthorized' })
  const body = (typeof req.body === 'object' && req.body) || {}
  const lines: unknown = (body as { lines?: unknown }).lines
  if (!Array.isArray(lines) || lines.length > 400 || !lines.every((l) => typeof l === 'string' && l.length <= 500)) return void res.status(400).json({ error: 'bad_lines' })
  try {
    const tk = await tokenizer()
    res.json({ lines: (lines as string[]).map((l) => lineRomaji(tk, l)) })
  } catch (e) {
    console.error('romaji failed', e)
    res.status(500).json({ error: 'internal' })
  }
})

/** For tests: convert lines without HTTP. */
export async function romajiLines(lines: string[]): Promise<string[]> {
  const tk = await tokenizer()
  return lines.map((l) => lineRomaji(tk, l))
}
