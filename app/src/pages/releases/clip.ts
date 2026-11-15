import type { PreviewClip } from '../../components/list/PreviewRing'
import type { FeedItem } from '../../state/releaseViews'
import { loadPreviews } from './parts'

/** A release's first song with a Deezer clip (key `<release id>#<index>`, as the release panel uses). */
export function firstClip(it: FeedItem): Promise<PreviewClip | null> {
  return loadPreviews(it).then((dz) => {
    const j = dz ? dz.tracks.findIndex((t) => t.p) : -1
    return dz && j >= 0 ? { key: `${it.rel.id}#${j}`, url: dz.tracks[j].p! } : null
  })
}
