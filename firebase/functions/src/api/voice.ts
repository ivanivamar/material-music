/**
 * DJ voice (step 22c) — `/api/voice/*` on the app's own origin (Firebase Hosting → the `api` function).
 * Turns a DJ intro line into speech with Google Cloud
 * Text-to-Speech; the API key lives only here (Firebase secret), never in the app.
 *
 *   GET  /api/voice/status → { configured, voice }
 *   POST /api/voice/speak  { text, voice? } → { audio: <base64 MP3>, timepoints: [{ i, t }], voice, chars }
 *        `timepoints` (word index → seconds) only for voices that take SSML marks (Neural2, Studio,
 *        WaveNet, Standard); Chirp 3: HD voices come back without them and the app estimates the
 *        word timing from the loudness of the audio.
 *
 * Costs nothing inside Google's free allowance (1 million characters a month for Neural2 / Chirp 3:
 * HD). Guards, from the inside out: the app stops asking at 500k characters a month (synced
 * counter in dj.json); this function refuses lines over 600 characters and more than DAILY_CHARS a
 * day (counted per function instance — at most 3 — unless a store is passed as DJ_VOICE_KV);
 * and the Google Cloud project has a lowered quota + a €1 budget alert.
 *
 * Needs the `X-Pelagic: 1` header (like the other helpers). The Android app calls it from
 * https://localhost, so that origin gets CORS headers.
 *
 * Setup: Google Cloud project → enable "Cloud Text-to-Speech API" → Credentials → API key
 * restricted to that API → `firebase functions:secrets:set GOOGLE_TTS_API_KEY` → deploy the function
 * (the Firebase workflow does it on push). Default voice en-US-Chirp3-HD-Charon.
 */

interface Kv {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
}

interface Env {
  GOOGLE_TTS_API_KEY?: string
  TTS_VOICE?: string
  DJ_VOICE_KV?: Kv
}

interface Ctx {
  request: Request
  env: Env
  params: { action?: string | string[] }
}

const DEFAULT_VOICE = 'en-US-Chirp3-HD-Charon'
/** male English voices the app may ask for */
const VOICES = new Set([
  'en-US-Chirp3-HD-Charon',
  'en-US-Chirp3-HD-Fenrir',
  'en-US-Chirp3-HD-Orus',
  'en-US-Chirp3-HD-Iapetus',
  'en-GB-Chirp3-HD-Charon',
  'en-GB-Chirp3-HD-Fenrir',
  'en-GB-Chirp3-HD-Orus',
  'en-GB-Chirp3-HD-Iapetus',
  'en-US-Neural2-D',
  'en-US-Neural2-J',
  'en-GB-Neural2-B',
  'en-GB-Neural2-D',
])
const MAX_TEXT = 600
const DAILY_CHARS = 40_000
const NATIVE_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost'])

let memDay = ''
let memChars = 0

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || !NATIVE_ORIGINS.has(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-pelagic',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(request) } })

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Over today's limit? Counts the characters when not. */
async function spend(env: Env, chars: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  if (env.DJ_VOICE_KV) {
    const key = `chars:${day}`
    const used = Number((await env.DJ_VOICE_KV.get(key)) ?? 0)
    if (used + chars > DAILY_CHARS) return false
    await env.DJ_VOICE_KV.put(key, String(used + chars), { expirationTtl: 3 * 86_400 })
    return true
  }
  if (memDay !== day) {
    memDay = day
    memChars = 0
  }
  if (memChars + chars > DAILY_CHARS) return false
  memChars += chars
  return true
}

interface GoogleResponse {
  audioContent?: string
  timepoints?: { markName: string; timeSeconds: number }[]
  error?: { message?: string }
}

async function synthesize(key: string, text: string, voice: string): Promise<{ audio: string; timepoints: { i: number; t: number }[] }> {
  const languageCode = voice.split('-').slice(0, 2).join('-')
  const marks = !/Chirp/i.test(voice)
  let body: Record<string, unknown>
  let url: string
  if (marks) {
    // a mark before every word → exact word timing for the subtitle
    const words = text.split(/\s+/).filter(Boolean)
    const ssml = `<speak>${words.map((w, i) => `<mark name="w${i}"/>${esc(w)}`).join(' ')}</speak>`
    url = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize'
    body = { input: { ssml }, voice: { languageCode, name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 }, enableTimePointing: ['SSML_MARK'] }
  } else {
    url = 'https://texttospeech.googleapis.com/v1/text:synthesize'
    body = { input: { text }, voice: { languageCode, name: voice }, audioConfig: { audioEncoding: 'MP3' } }
  }
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) })
  const j = (await res.json().catch(() => ({}))) as GoogleResponse
  if (!res.ok || !j.audioContent) throw new Error(j.error?.message || `Text-to-Speech answered ${res.status}`)
  const timepoints = (j.timepoints ?? [])
    .map((p) => ({ i: Number(p.markName.slice(1)), t: p.timeSeconds }))
    .filter((p) => Number.isFinite(p.i) && Number.isFinite(p.t))
  return { audio: j.audioContent, timepoints }
}

export async function onRequest({ request, env, params }: Ctx): Promise<Response> {
  const action = Array.isArray(params.action) ? params.action[0] : params.action
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) })
  if (request.headers.get('x-pelagic') !== '1') return json(request, { error: 'forbidden' }, 403)
  const key = env.GOOGLE_TTS_API_KEY?.trim()
  const fallbackVoice = env.TTS_VOICE?.trim() && VOICES.has(env.TTS_VOICE.trim()) ? env.TTS_VOICE.trim() : DEFAULT_VOICE

  if (action === 'status') {
    if (request.method !== 'GET') return json(request, { error: 'method_not_allowed' }, 405)
    return json(request, { configured: !!key, voice: fallbackVoice })
  }

  if (action === 'speak') {
    if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405)
    if (!key) return json(request, { error: 'not_configured' }, 503)
    let input: { text?: unknown; voice?: unknown }
    try {
      input = (await request.json()) as typeof input
    } catch {
      return json(request, { error: 'bad_json' }, 400)
    }
    const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim() : ''
    if (!text) return json(request, { error: 'missing_text' }, 400)
    if (text.length > MAX_TEXT) return json(request, { error: 'too_long' }, 413)
    const voice = typeof input.voice === 'string' && VOICES.has(input.voice) ? input.voice : fallbackVoice
    if (!(await spend(env, text.length))) return json(request, { error: 'daily_limit' }, 429)
    try {
      const out = await synthesize(key, text, voice)
      return json(request, { ...out, voice, chars: text.length })
    } catch (e) {
      return json(request, { error: 'tts_failed', message: (e as Error).message }, 502)
    }
  }

  return json(request, { error: 'not_found' }, 404)
}
