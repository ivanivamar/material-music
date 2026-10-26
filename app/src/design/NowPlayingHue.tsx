/**
 * Keeps `--h` on <html> at the playing album's hue (Material redesign: album colour on small accents only).
 * Nothing playing → brand coral. Transitions smoothly (@property --h in base.css).
 */
import { useEffect } from 'react'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { usePlayer } from '../state/player'
import { BRAND_HUE, setNowPlayingHue } from './albumHue'
import { useArtTint } from './tint'

export function NowPlayingHue() {
  const p = usePlayer()
  const { data } = useLibrary()
  const id = p.index >= 0 ? p.queue[p.index] : null
  const track = (id && data?.tracks[id]) || null
  const album = track ? data?.albums[track.albumId] : undefined
  const cover = useCover(album?.cover)
  const tint = useArtTint(cover)
  const hue = tint?.hue ?? (cover ? null : BRAND_HUE)
  useEffect(() => {
    if (hue != null) setNowPlayingHue(hue)
  }, [hue])
  return null
}
