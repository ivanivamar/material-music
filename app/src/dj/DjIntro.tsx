/**
 * The intro moment (handoff_dj §4): the right column of the full-screen player while the DJ
 * speaks, the spoken line as lyric lines in the lyrics view, and the compact versions for the
 * player bar / mini-player. Everything reads the same live clock (dj/live.ts).
 */
import { useCallback } from 'react'
import { Icon } from '../design/icons'
import { useMotion } from '../state/motion'
import type { DjView } from '../state/dj'
import { DjMark, LevelBars } from './DjMark'
import { TYPE_UPPER } from './engine'
import { useIntroLive, type IntroLive, useIntroSpeaking, introLevel } from './live'

const words = (line: string) => line.split(/\s+/).filter(Boolean)

/** "FIRST SONG IN 6S" */
const firstIn = (live: IntroLive) => `FIRST SONG IN ${Math.max(0, Math.ceil(live.duration - live.t))}S`

function Subtitle({ line, live }: { line: string; live: IntroLive }) {
  const ws = words(line)
  return (
    <p className="dji-line" aria-label={line}>
      {ws.map((w, i) => (
        <span key={i} className={i < live.word || live.word >= ws.length ? 'is-said' : i === live.word ? (live.kind === 'silent' ? 'is-said' : 'is-now') : ''} aria-hidden>
          {w}
        </span>
      ))}
    </p>
  )
}

function VoiceRow({ live, playing, phone }: { live: IntroLive; playing: boolean; phone: boolean }) {
  if (live.kind === 'silent' || !live.kind) {
    const label = live.audio?.reason === 'off' ? 'VOICE OFF · TEXT INTRO' : 'TEXT INTRO'
    const pct = live.duration ? Math.min(100, (live.t / live.duration) * 100) : 0
    return phone ? (
      <div className="dji-voice is-text">
        <span className="dji-count">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="t-mono">TEXT · {firstIn(live)}</span>
      </div>
    ) : (
      <div className="dji-voice is-text">
        <span className="dji-count">
          <span style={{ width: `${pct}%` }} />
        </span>
        <div className="dji-voice-m t-mono">
          <span className="is-l">{label}</span>
          <span>{firstIn(live)}</span>
        </div>
      </div>
    )
  }
  const l = !playing ? 'PAUSED' : live.speaking ? 'DJ · SPEAKING' : live.word < 0 ? 'DJ · ABOUT TO SPEAK' : 'HANDING OVER'
  return phone ? (
    <div className="dji-voice">
      <LevelBars n={36} height={22} level={live.level} speaking={live.speaking} t={live.t} />
      <span className="t-mono">{firstIn(live)}</span>
    </div>
  ) : (
    <div className="dji-voice">
      <LevelBars n={60} height={34} level={live.level} speaking={live.speaking} t={live.t} className="is-big" />
      <div className="dji-voice-m t-mono">
        <span className="is-l">{l}</span>
        <span>{firstIn(live)}</span>
      </div>
    </div>
  )
}

/** Right column during the intro: DJ chip · INTRO · SESSION n (· SKIPPED · …), title, type, the line, the voice. No song counts anywhere. */
export function DjIntroInfo({ item, view, playing, phone }: { item: string; view: DjView; playing: boolean; phone: boolean }) {
  const live = useIntroLive(item, true)
  const s = view.session
  if (!s) return null
  return (
    <div className="dji">
      {phone ? (
        <div className="dji-head">
          <div className="dji-title is-phone">{s.title}</div>
          <div className="dji-mono t-mono">{TYPE_UPPER[s.kind]}</div>
        </div>
      ) : (
        <div className="dji-head">
          <div className="dji-meta t-mono">
            <span className="dj-chip">DJ</span>
            <span>INTRO</span>
            <span>SESSION {s.n}</span>
            {view.skippedFrom && <span className="dji-skipped">SKIPPED · {view.skippedFrom.toUpperCase()}</span>}
          </div>
          <div className="dji-title">{s.title}</div>
          <div className="dji-count-row">
            <span className="t-mono">{TYPE_UPPER[s.kind]}</span>
          </div>
        </div>
      )}
      <Subtitle line={s.line} live={live} />
      {s.note && (
        <div className="dji-note">
          <Icon name="alert" />
          {s.note}
        </div>
      )}
      <VoiceRow live={live} playing={playing} phone={phone} />
    </div>
  )
}

/** Lyrics view during the intro: the spoken line as sentences, the current one lit in gold. */
export function DjIntroLyrics({ item, line }: { item: string; line: string }) {
  const live = useIntroLive(item, true)
  const motion = useMotion()
  const sentences = (line.match(/[^.!?]+[.!?]+/g) ?? [line]).map((x) => x.trim()).filter(Boolean)
  // which sentence holds the word being said
  let cur = 0
  let acc = 0
  sentences.forEach((x, i) => {
    if (live.word >= acc) cur = i
    acc += words(x).length
  })
  if (live.word < 0) cur = 0
  return (
    <>
      <div className="ly-viewport">
        <div className={`ly-list pg-anim ${motion ? '' : 'is-snap'}`} style={{ transform: `translate3d(0, ${Math.min(0, -(cur - 1) * 92)}px, 0)` }}>
          {sentences.map((x, i) => (
            <div key={i} className={`ly-line dj-ly-line ${i === cur ? 'is-on' : ''}`} style={{ opacity: Math.abs(i - cur) > 2 ? 0.35 : i === cur ? 1 : 0.72 }}>
              <span className="ly-bar" aria-hidden />
              <span className="ly-body">
                <span className="ly-text">{x}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="ly-foot">
        <span className="ly-badge is-dj">
          <span className="ly-badge-dot" />
          DJ INTRO
        </span>
        <span className="ly-hint">SPOKEN · LIVE</span>
      </div>
    </>
  )
}

/** The mark standing in for a cover, speaking with the live voice. */
export function LiveMark({ item, size, radius, shadow, fluid, active = true }: { item: string; size: number; radius?: number; shadow?: string; fluid?: boolean; active?: boolean }) {
  // re-renders only when the voice starts / stops; the level goes straight into a CSS variable
  const speaking = useIntroSpeaking(item, active)
  const getLevel = useCallback(() => introLevel(item), [item])
  return <DjMark size={size} speaking={speaking} getLevel={getLevel} radius={radius} shadow={shadow} fluid={fluid} />
}

/** Player bar / mini-player sub line during the intro: 10 level bars + "DJ is speaking". */
export function IntroSub({ item }: { item: string }) {
  const live = useIntroLive(item, true)
  const text = live.kind === 'silent' ? 'Text intro' : 'DJ is speaking'
  return (
    <span className="dj-introsub">
      {live.kind !== 'silent' && <LevelBars n={10} height={10} level={live.level} speaking={live.speaking} t={live.t} className="is-mini" />}
      <span className="dj-introsub-t">{text}</span>
    </span>
  )
}

