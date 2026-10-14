/**
 * Dev-only reference page: renders tokens, type, icons, logo and textures so they can be
 * compared side by side with section 02 of design_handoff_pelagic/Pelagic.dc.html.
 * Open at #/dev/foundations.
 */
import type { CSSProperties } from 'react'
import { Icon, ICON_NAMES } from '../design/icons'
import { CONTOUR_SMOOTH, GRAIN, STONE } from '../design/textures'
import { quality } from '../design/tokens'
import { Aperture, Lockup } from '../components/Logo'
import './foundations.css'

const SWATCHES: [string, string, string][] = [
  ['bg-0', '#050505', 'deepest canvas'],
  ['bg-1', '#0B0B0C', 'app background'],
  ['surface-1', '#121214', 'rows, inputs'],
  ['surface-2', '#1A1A1D', 'toasts, hover'],
  ['menu', '#161618', 'menus'],
  ['dialog', '#141416', 'dialogs, sheets'],
  ['panel', '#0E0E10', 'side panels'],
  ['ink-primary', '#EDEDED', 'text'],
  ['ink-secondary', '#8A8A8E', 'secondary'],
  ['ink-tertiary', '#55555A', 'mono metadata'],
  ['ink-ghost', '#3A3A3E', 'disabled'],
  ['line', '#FFFFFF', 'the accent'],
]

const QUALITY_LABELS: Record<keyof typeof quality, string> = {
  flac16: 'FLAC 16/44.1',
  flac24: 'FLAC 24/48',
  opus: 'OPUS 160',
}

export function Foundations() {
  return (
    <div className="fd">
      <header className="fd-head">
        <div className="t-mono">Pelagic / foundations</div>
        <div className="t-page">Tokens, type, icons and textures.</div>
      </header>

      <section className="fd-sec">
        <div className="t-mono">01 / Mark</div>
        <div className="fd-row fd-logo">
          <Lockup size={150} />
          <div className="fd-tiles">
            <div className="fd-appicon fd-appicon-lg"><Aperture size={44} dot={false} /></div>
            <div className="fd-appicon"><Aperture size={20} dot={false} /></div>
          </div>
        </div>
      </section>

      <section className="fd-sec">
        <div className="t-mono">02 / Colour</div>
        <div className="fd-swatches">
          {SWATCHES.map(([name, hex, use]) => (
            <div key={name} className="fd-swatch">
              <div className="fd-chip" style={{ background: `var(--${name})` }} />
              <div className="fd-swatch-name">{name}</div>
              <div className="t-mono">{hex} · {use}</div>
            </div>
          ))}
        </div>
        <div className="fd-row">
          {(Object.keys(quality) as (keyof typeof quality)[]).map((k) => (
            <span key={k} className={`fd-badge q-${k}`}>{QUALITY_LABELS[k]}</span>
          ))}
          {['ALBUM', 'EP', 'SINGLE', 'LIVE', 'REISSUE'].map((r) => (
            <span key={r} className="fd-badge fd-release">{r}</span>
          ))}
          <span className="fd-badge fd-danger">Remove download</span>
        </div>
      </section>

      <section className="fd-sec">
        <div className="t-mono">03 / Type</div>
        <div className="t-hero">Tsunami Sea</div>
        <div className="t-page">Library</div>
        <div className="t-section">Recently added</div>
        <div className="t-body" style={{ fontSize: 16 }}>Body 16 — The interface is grayscale. All colour comes from album art.</div>
        <div className="t-body">Body 14 — Every change saves instantly.</div>
        <div className="t-secondary">Secondary 13 — Spiritbox · 2025 · 11 songs</div>
        <div className="t-mono">Mono 11 · FLAC 16/44.1 · 4:21 · added 12 Oct</div>
        <div className="t-jp" style={{ fontSize: 22 }}>唱 — 見せてやるよ</div>
        <div className="fd-row fd-weights">
          {[300, 400, 500, 600].map((w) => (
            <span key={w} style={{ fontWeight: w }}>General Sans {w}</span>
          ))}
        </div>
        <div className="t-mono" style={{ fontSize: 'var(--fs-counter)', letterSpacing: '0.04em', color: 'var(--ink-primary)' }}>1,284</div>
      </section>

      <section className="fd-sec">
        <div className="t-mono">04 / Icons · 1.25 stroke · 24 grid</div>
        <div className="fd-icons">
          {ICON_NAMES.map((n) => (
            <div key={n} className="fd-icon">
              <Icon name={n} size={21} />
              <span className="t-mono">{n}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="fd-sec">
        <div className="t-mono">05 / Glow</div>
        <div className="fd-row" style={{ gap: 48, alignItems: 'center' }}>
          <div className="fd-dot" />
          <div className="fd-gline" />
          <div className="fd-ring" />
        </div>
      </section>

      <section className="fd-sec">
        <div className="t-mono">06 / Textures</div>
        <div className="fd-textures">
          <Tex label="Stone · .09 · 900px" style={{ backgroundImage: STONE, backgroundSize: '900px 900px', opacity: 0.09 * 4 }} />
          <Tex label="Contour · .075 · cover" style={{ backgroundImage: CONTOUR_SMOOTH, backgroundSize: 'cover', opacity: 0.075 * 4 }} />
          <Tex label="Grain · .07 · screen" style={{ backgroundImage: GRAIN, backgroundSize: '220px 220px', opacity: 0.07 * 3, mixBlendMode: 'screen' }} />
        </div>
        <div className="t-mono">Shown at 3–4× production opacity for inspection</div>
      </section>
    </div>
  )
}

function Tex({ label, style }: { label: string; style: CSSProperties }) {
  return (
    <div className="fd-tex">
      <div className="fd-tex-fill" style={style} />
      <div className="t-mono fd-tex-label">{label}</div>
    </div>
  )
}
