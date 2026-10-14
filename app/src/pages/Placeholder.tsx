/** Stand-in for pages that later build steps fill in. */
import { EmptyState } from '../components/ui'
import type { IconName } from '../design/icons'
import { PageHeader } from './PageHeader'

export function Placeholder({ title, meta, icon, line, body }: { title: string; meta?: string; icon: IconName; line: string; body: string }) {
  return (
    <>
      <PageHeader meta={meta} title={title} />
      <div className="placeholder">
        <EmptyState icon={icon} title={line} body={body} />
      </div>
    </>
  )
}
