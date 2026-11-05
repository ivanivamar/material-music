/** Dev gallery (#/dev/components): the shared overlay, tab and badge parts. */
import { useState } from 'react'
import { Badge, Button, Dialog, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, Sheet, Tabs, TextField, type MenuAnchor } from '../components/ui'

const SORTS = ['Recently added', 'Title', 'Artist', 'Year'] as const

export function OverlayPanels() {
  const [tab, setTab] = useState<'upcoming' | 'out' | 'discover'>('upcoming')
  const [chipTab, setChipTab] = useState<'albums' | 'artists' | 'songs'>('albums')
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const [sortAt, setSortAt] = useState<MenuAnchor | null>(null)
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Recently added')
  const [dlg, setDlg] = useState<null | 'dialog' | 'full' | 'sheet'>(null)
  const [sheet, setSheet] = useState<null | 'plain' | 'expand' | 'dj'>(null)
  const [name, setName] = useState('')

  return (
    <>
      <section className="cg-panel">
        <div className="cg-title t-mono">Tabs</div>
        <Tabs
          label="New releases"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'upcoming', label: 'Upcoming', count: 12 },
            { value: 'out', label: 'Out now', count: 4 },
            { value: 'discover', label: 'Discover' },
          ]}
        />
        <div style={{ height: 20 }} />
        <Tabs label="Library" variant="chips" value={chipTab} onChange={setChipTab} items={[{ value: 'albums', label: 'Albums', count: '1,204' }, { value: 'artists', label: 'Artists', count: 310 }, { value: 'songs', label: 'Songs' }]} />
      </section>

      <section className="cg-panel">
        <div className="cg-title t-mono">Badges</div>
        <div className="cg-btns" style={{ alignItems: 'center' }}>
          <Badge size="sm">Radio</Badge>
          <Badge size="sm" tone="dj">DJ</Badge>
          <Badge size="sm" tone="album-container">On Kitchen speaker</Badge>
          <Badge tone="tonal">Played</Badge>
          <Badge tone="album">Album</Badge>
          <Badge tone="success" size="lg" icon="concerts">On tour</Badge>
          <Badge tone="warn" icon="warning">Needs you</Badge>
          <Badge tone="danger">Cancelled</Badge>
          <Badge tone="brand">New</Badge>
        </div>
      </section>

      <section className="cg-panel">
        <div className="cg-title t-mono">Menus</div>
        <div className="cg-btns" style={{ alignItems: 'center' }}>
          <IconButton icon="more" label="More" variant="soft" onClick={(e) => setMenuAt(menuAt ? null : e.currentTarget)} />
          <Button variant="tonal" icon="sort" onClick={(e) => setSortAt(sortAt ? null : e.currentTarget)}>
            {sort}
          </Button>
          <span className="t-mono" style={{ fontSize: 10 }}>Right-click this panel for a context menu</span>
        </div>
        <div style={{ height: 60 }} onContextMenu={(e) => (e.preventDefault(), setMenuAt({ x: e.clientX, y: e.clientY }))} />
        <Menu open={!!menuAt} anchor={menuAt} onClose={() => setMenuAt(null)} label="Album" placement="bottom-start">
          <MenuItem icon="playF">Play</MenuItem>
          <MenuItem icon="queue" trailing="12 songs">Add to queue</MenuItem>
          <MenuItem icon="playlist" description="Pick one of 8 playlists">Add to playlist…</MenuItem>
          <MenuItem icon="download" disabled>Download (offline)</MenuItem>
          <MenuSeparator />
          <MenuItem icon="delete" danger>Remove from library</MenuItem>
        </Menu>
        <Menu open={!!sortAt} anchor={sortAt} onClose={() => setSortAt(null)} label="Sort by">
          <MenuLabel>Sort by</MenuLabel>
          {SORTS.map((s) => (
            <MenuItem key={s} selected={s === sort} onSelect={() => setSort(s)}>
              {s}
            </MenuItem>
          ))}
        </Menu>
      </section>

      <section className="cg-panel">
        <div className="cg-title t-mono">Dialogs and sheets</div>
        <div className="cg-btns">
          <Button variant="tonal" onClick={() => setDlg('dialog')}>Dialog</Button>
          <Button variant="tonal" onClick={() => setDlg('full')}>Dialog · phone full screen</Button>
          <Button variant="tonal" onClick={() => setDlg('sheet')}>Dialog · phone sheet</Button>
        </div>
        <div className="cg-btns" style={{ marginTop: 12 }}>
          <Button variant="outlined" onClick={() => setSheet('plain')}>Sheet</Button>
          <Button variant="outlined" onClick={() => setSheet('expand')}>Expandable sheet</Button>
          <Button variant="outlined" onClick={() => setSheet('dj')}>DJ sheet</Button>
        </div>
        <Dialog
          open={!!dlg}
          onClose={() => setDlg(null)}
          title="New playlist"
          subtitle="Name it now, add songs from any album or song menu."
          icon="playlist"
          phone={dlg === 'full' ? 'full' : dlg === 'sheet' ? 'sheet' : 'dialog'}
          actions={
            <>
              <Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button>
              <Button variant="filled" disabled={!name.trim()} onClick={() => setDlg(null)}>Create</Button>
            </>
          }
        >
          <TextField label="Name" value={name} onChange={setName} />
        </Dialog>
        <Sheet
          open={!!sheet}
          onClose={() => setSheet(null)}
          label="Sheet demo"
          title={sheet === 'expand' ? 'Queue' : sheet === 'dj' ? 'DJ' : 'Location'}
          meta={sheet === 'expand' ? '24 songs · drag up for full height' : 'Drag the header down to close'}
          expandable={sheet === 'expand'}
          tone={sheet === 'dj' ? 'dj' : sheet === 'expand' ? 'glass' : 'default'}
          footer={sheet === 'plain' ? <Button variant="filled" onClick={() => setSheet(null)}>Done</Button> : undefined}
        >
          {Array.from({ length: sheet === 'plain' ? 4 : 24 }, (_, i) => (
            <div key={i} style={{ height: 52, display: 'flex', alignItems: 'center', boxShadow: 'inset 0 -1px 0 oklch(1 0 0 / .06)', fontSize: 15 }}>
              Row {i + 1}
            </div>
          ))}
        </Sheet>
      </section>
    </>
  )
}
