/**
 * Korean → Latin letters (Nov 2026), for lyrics: the Revised Romanization of Korean, the system on
 * road signs and in most romanised K-pop lyrics. Runs in the app (Hangul spells its sounds, so no
 * dictionary is needed) and works offline.
 *
 * Each syllable is split into its letters (initial · vowel · final). Inside a word the usual sound
 * changes are applied, written as they're said:
 *   linking      a final before a silent ㅇ moves over        먹어 → meogeo, 읽어 → ilgeo
 *   nasalising   k/t/p before ㄴ/ㅁ become ng/n/m            합니다 → hamnida, 국물 → gungmul
 *   ㄹ           ㄴ+ㄹ / ㄹ+ㄴ → ll; ㄹ after other finals → n   신라 → silla, 종로 → jongno
 *   ㅎ           ㅎ with ㄱ/ㄷ/ㅈ/ㅂ → k/t/ch/p; silent before a vowel   좋다 → jota, 좋아 → joa
 *   palatalising ㄷ/ㅌ before 이 → ji / chi                    같이 → gachi
 * Not covered: the irregular ㄴ inserted in some compounds (꽃잎 is read kkonnip, written kkochip here).
 * Words stay apart where the lyrics have spaces; everything that isn't Hangul is kept as written.
 */

const INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']

/** Final letters (jongseong index 0–27) as [the letter left at the end, the letter that moves over before a vowel]. */
const FINAL: [string, string][] = [
  ['', ''], // none
  ['k', 'g'], // ㄱ
  ['k', 'kk'], // ㄲ
  ['k', 's'], // ㄳ → ㄱ stays, ㅅ moves
  ['n', 'n'], // ㄴ
  ['n', 'j'], // ㄵ
  ['n', 'h'], // ㄶ
  ['t', 'd'], // ㄷ
  ['l', 'r'], // ㄹ
  ['k', 'g'], // ㄺ
  ['m', 'm'], // ㄻ
  ['l', 'b'], // ㄼ
  ['l', 's'], // ㄽ
  ['l', 't'], // ㄾ
  ['p', 'p'], // ㄿ
  ['l', 'h'], // ㅀ
  ['m', 'm'], // ㅁ
  ['p', 'b'], // ㅂ
  ['p', 's'], // ㅄ
  ['t', 's'], // ㅅ
  ['t', 'ss'], // ㅆ
  ['ng', 'ng'], // ㅇ
  ['t', 'j'], // ㅈ
  ['t', 'ch'], // ㅊ
  ['k', 'k'], // ㅋ
  ['t', 't'], // ㅌ
  ['p', 'p'], // ㅍ
  ['t', 'h'], // ㅎ
]
/** For double finals: what stays when the second letter moves to the next syllable. */
const FINAL_KEEP: Record<number, string> = { 3: 'k', 5: 'n', 6: 'n', 9: 'l', 10: 'l', 11: 'l', 12: 'l', 13: 'l', 14: 'l', 15: 'l', 18: 'p' }

const BASE = 0xac00
const isSyllable = (c: number) => c >= BASE && c <= 0xd7a3
export const HANGUL = /[가-힣]/

interface Syl {
  i: number
  v: number
  f: number
}
const split = (c: number): Syl => {
  const n = c - BASE
  return { i: Math.floor(n / 588), v: Math.floor((n % 588) / 28), f: n % 28 }
}

const SILENT = 11 // ㅇ initial
const H = 18 // ㅎ initial
const N_INIT = 2 // ㄴ
const M_INIT = 6 // ㅁ
const R_INIT = 5 // ㄹ

/** One run of Hangul syllables (a word): syllables with the sound changes between them. */
function word(syls: Syl[]): string {
  let out = ''
  // what the next syllable starts with (set when a final moves over or changes it)
  let carry: string | null = null
  for (let k = 0; k < syls.length; k++) {
    const s = syls[k]
    const next = syls[k + 1]
    let init = carry ?? INITIAL[s.i]
    carry = null
    let fin = FINAL[s.f][0]
    if (next && s.f) {
      const ni = next.i
      const sound = FINAL[s.f][0]
      if (ni === SILENT) {
        // linking: the final (or the second of two) is pronounced as the next syllable's start
        const moving = FINAL[s.f][1]
        if (s.f === 27) {
          fin = '' // ㅎ before a vowel is silent: 좋아 joa
        } else if (s.f === 21) {
          fin = 'ng' // ㅇ stays
        } else if (FINAL_KEEP[s.f]) {
          fin = FINAL_KEEP[s.f]
          carry = moving === 'h' ? '' : moving
        } else {
          fin = ''
          // palatalising: ㄷ/ㅌ before 이 → ji / chi (같이 gachi, 굳이 guji)
          carry = next.v === 20 && s.f === 7 ? 'j' : next.v === 20 && s.f === 25 ? 'ch' : moving
        }
      } else if (ni === H && (sound === 'k' || sound === 't' || sound === 'p')) {
        // aspiration: 축하 chuka, 많지 → handled below; final k/t/p + ㅎ → kh→k, t, p
        fin = ''
        carry = sound === 't' ? (s.f === 22 || s.f === 23 ? 'ch' : 't') : sound
      } else if (s.f === 27 || s.f === 6 || s.f === 15) {
        // ㅎ (also ㄶ, ㅀ) before ㄱ/ㄷ/ㅈ: aspirated; before ㄴ: n; before ㅅ: ss
        const keep = s.f === 27 ? '' : s.f === 6 ? 'n' : 'l'
        if (ni === 0) ((fin = keep), (carry = 'k'))
        else if (ni === 3) ((fin = keep), (carry = 't'))
        else if (ni === 12) ((fin = keep), (carry = 'ch'))
        else if (ni === 9) ((fin = keep), (carry = 'ss'))
        else if (ni === N_INIT) fin = s.f === 27 ? 'n' : keep === 'l' ? 'l' : 'n'
        else fin = keep
      } else if (ni === N_INIT || ni === M_INIT) {
        // nasalising
        if (sound === 'k') fin = 'ng'
        else if (sound === 't') fin = 'n'
        else if (sound === 'p') fin = 'm'
        if (sound === 'l' && ni === N_INIT) carry = 'l' // ㄹ+ㄴ → ll
      } else if (ni === R_INIT) {
        if (sound === 'n' || sound === 'l') {
          fin = 'l'
          carry = 'l' // 신라 silla
        } else {
          carry = 'n' // 종로 jongno, 심리 simni
          if (sound === 'k') fin = 'ng'
          else if (sound === 'p') fin = 'm'
          else if (sound === 't') fin = 'n'
        }
      }
    }
    out += init + VOWEL[s.v] + fin
  }
  return out
}

/** A lyric line in Revised Romanization ("" when it has no Hangul). */
export function romanizeKorean(line: string): string {
  if (!HANGUL.test(line)) return ''
  let out = ''
  let run: Syl[] = []
  const flush = () => {
    if (run.length) out += word(run)
    run = []
  }
  for (const ch of line) {
    const c = ch.codePointAt(0)!
    if (isSyllable(c)) run.push(split(c))
    else {
      flush()
      out += ch
    }
  }
  flush()
  const text = out.replace(/\s+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
