/**
 * Home pieces from the Nov 2026 redesign (HomeV2) that have no older counterpart:
 * - DayMixHero: the Day mix as the big card at the head of Made for you (label, title over the art, 54px play)
 * - ReleasesSoon: the "Coming soon" strip over the New releases row (cover, next release, live countdown)
 * - ConcertTicket: the ticket-shaped card in Concerts near you (date stub, tour line, artist, place, status, Tickets)
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from '../../design/icons'
import { nameHue } from '../../lib/mixing'
import type { Catalogue } from '../../state/library'
import { playMix, type MixPlan } from '../../state/mixes'
import type { DayMix } from '../../state/daymix'
import { playerStore } from '../../state/player'
import type { FeedItem } from '../../state/releaseViews'
import { kmLabel, statusLook, timeLabel, type Show } from '../../state/concertViews'
import { go, href, mixHref } from '../../shell/routes'
import { MixCover } from './art'
import { usePlayingContext } from './cards'
import { ReleaseCover, openExternal } from '../releases/parts'
import { ticketsOf, useArtistLook } from '../concerts/parts'

const DAY = 86_400_000
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/* ── Day mix, big ───────────────────────────────────── */

export function DayMixHero({ c, mix, width, height }: { c: Catalogue; mix: MixPlan; width: number; height: number }) {
  const st = usePlayingContext('mix', mix.id)
  const day = (mix as DayMix).day
  const label = day ? `Day mix · ${day.slot.weekday} ${day.slot.label}` : 'Day mix'
  // "upbeat metalcore & djent tuesday morning" → "Upbeat metalcore & djent" (the label already says when)
  const when = day ? new RegExp(`\\s*${day.slot.weekday}\\s+${day.slot.label}\\s*$`, 'i') : null
  const title = cap((when ? mix.sub.replace(when, '') : mix.sub) || mix.title)
  const s = Math.max(width, height)
  return (
    <div className="hdm" style={{ width, height }} role="link" tabIndex={0} onClick={() => go(mixHref(mix.id))} onKeyDown={(e) => e.key === 'Enter' && go(mixHref(mix.id))}>
      <span className="hdm-art" aria-hidden>
        <MixCover c={c} mix={mix} size={s} radius={0} />
      </span>
      <span className="hdm-shade" aria-hidden />
      <span className="hdm-k">{label}</span>
      <span className="hdm-foot">
        <span className="hdm-t">{title}</span>
        <button
          type="button"
          className="hdm-play"
          aria-label={st.playing ? 'Pause Day mix' : 'Play Day mix'}
          onClick={(e) => {
            e.stopPropagation()
            if (st.active) playerStore.toggle()
            else playMix(mix)
          }}
        >
          <Icon name={st.playing ? 'pauseF' : 'playF'} />
        </button>
      </span>
    </div>
  )
}

/* ── Coming soon strip ──────────────────────────────── */

/** the time now, refreshed every `ms` (the countdown's minutes) */
function useNow(ms: number) {
  const [now, set] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => set(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

export function ReleasesSoon({ upcoming }: { upcoming: FeedItem[] }) {
  const now = useNow(30_000)
  const next = upcoming[0]
  const at = next.day // local midnight of the release day
  const left = Math.max(0, at - now)
  const d = Math.floor(left / DAY)
  const h = Math.floor((left % DAY) / 3_600_000)
  const m = Math.floor((left % 3_600_000) / 60_000)
  const date = new Date(at)
  const H = nameHue(next.owners[0]?.name ?? next.rel.a)
  const reminders = upcoming.filter((it) => it.reminded).length
  const parts = [
    { v: String(d), l: 'Days' },
    { v: String(h).padStart(2, '0'), l: 'Hrs' },
    { v: String(m).padStart(2, '0'), l: 'Min' },
  ]
  return (
    <a className="hrs" href={`${href('new')}?rel=${encodeURIComponent(next.rel.id)}`} style={{ '--rh': H } as CSSProperties}>
      <span className="hrs-cover" aria-hidden>
        <ReleaseCover item={next} size="xs" />
      </span>
      <span className="hrs-text">
        <span className="hrs-k">
          Coming soon · in {next.daysTo} {next.daysTo === 1 ? 'day' : 'days'}
        </span>
        <span className="hrs-t">
          {next.rel.t} · {next.owners[0]?.name ?? next.rel.a} · {cap(DOW[date.getDay()].toLowerCase())} {date.getDate()} {cap(MON[date.getMonth()].toLowerCase())}
        </span>
      </span>
      <span className="hrs-right">
        {parts.map((p) => (
          <span key={p.l} className="hrs-cd">
            <span className="hrs-cd-v">{p.v}</span>
            <span className="hrs-cd-l">{p.l}</span>
          </span>
        ))}
        <span className="hrs-count">
          {reminders} {reminders === 1 ? 'reminder' : 'reminders'} on
          <br />
          {upcoming.length} coming soon
        </span>
      </span>
    </a>
  )
}

/* ── Concert ticket ─────────────────────────────────── */

export function ConcertTicket({ c, show, now }: { c: Catalogue; show: Show; now: number }) {
  const a = c.artists[show.artistId]
  const look = useArtistLook(a)
  const date = new Date(`${show.date}T12:00:00`)
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const days = Math.round((date.getTime() - today.getTime()) / DAY)
  const tour = show.festival ?? show.ev?.name ?? 'Live'
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  const look2 = statusLook(show)
  const url = ticketsOf(show)
  const place = [show.venue, show.city, timeLabel(show), kmLabel(show.km)].filter(Boolean).join(' · ')
  return (
    <a
      className="hct"
      href={`#/artist/${encodeURIComponent(show.artistId)}`}
      style={{ '--th': look.H } as CSSProperties}
    >
      <span className="hct-stub">
        <span className="hct-mon">{MON[date.getMonth()]}</span>
        <span className="hct-day">{date.getDate()}</span>
        <span className="hct-dow">{DOW[date.getDay()]}</span>
      </span>
      <span className="hct-body">
        <span className="hct-k">
          {tour} · {when}
        </span>
        <span className="hct-name">{a?.name}</span>
        <span className="hct-place">{place}</span>
        <span className="hct-foot">
          <span className={`hct-status ${look2.buy ? 'is-buy' : ''}`}>{look2.label}</span>
          {url && (
            <button
              type="button"
              className="hct-tk"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openExternal(url)
              }}
            >
              Tickets
            </button>
          )}
        </span>
      </span>
    </a>
  )
}
