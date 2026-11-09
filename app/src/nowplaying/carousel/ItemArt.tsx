import { LiveMark } from '../../dj/DjIntro'
import type { QueueItem } from './useQueueItem'

/** The cover (or the DJ's mark for an intro), filling its box. */
export function ItemArt({ item, size, active }: { item: QueueItem; size: number; active?: boolean }) {
  if (item.intro) return <LiveMark item={item.id} size={Math.max(32, size)} fluid active={!!active} />
  if (item.cover) return <img src={item.cover} alt="" draggable={false} />
  return <span className="qc-art-empty" />
}
