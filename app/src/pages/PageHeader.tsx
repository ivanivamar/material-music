import type { ReactNode } from 'react'

export function PageHeader({ meta, title, tools }: { meta?: ReactNode; title: ReactNode; tools?: ReactNode }) {
  return (
    <header className="ph">
      <div className="ph-text">
        <h1 className="ph-title">{title}</h1>
        {meta != null && <div className="ph-meta">{meta}</div>}
      </div>
      {tools && <div className="ph-tools">{tools}</div>}
    </header>
  )
}
