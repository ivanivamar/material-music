/**
 * "Share your year" (Nov 2026): makes the recap image (shareImage.ts), shows it, and shares or saves
 * it. Used on the Stats page (year view) and the Home recap card.
 */
import { useEffect, useState } from 'react'
import { Button, Dialog, IconButton, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { genreResolver, useGenres } from '../../state/genres'
import { useHistory } from '../../state/history'
import { useLibrary } from '../../state/library'
import { periodGenres, periodStats } from '../../state/stats'
import { canSaveFile, renderRecapImage, saveImage, shareImage } from './shareImage'

const enDate = (sec: number) => new Date(sec * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function ShareRecapButton({ year, compact, className }: { year: number; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {compact ? (
        <IconButton
          icon="share"
          label={`Share your ${year}`}
          className={className}
          // inside the Home recap card (itself a link): don't open the stats page too
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
        />
      ) : (
        <Button variant="tonal" className={className} onClick={() => setOpen(true)}>
          <Icon name="share" />
          Share your {year}
        </Button>
      )}
      {open && (
        // React events bubble out of portals: keep the dialog's clicks away from the Home recap card
        <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ShareRecapDialog year={year} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  )
}

function ShareRecapDialog({ year, onClose }: { year: number; onClose: () => void }) {
  const { data } = useLibrary()
  const history = useHistory()
  const genres = useGenres()
  const toast = useToast()
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const name = `material-music-${year}.png`

  useEffect(() => {
    if (!data) return
    let live = true
    let made: string | null = null
    const stats = periodStats(data, history.plays, { year, month: null })
    const firstEver = history.plays.find((p) => data.tracks[p.trackId])?.at ?? null
    const start = new Date(year, 0, 1).getTime() / 1000
    const now = new Date()
    void renderRecapImage({
      c: data,
      stats,
      genres: periodGenres(data, history.plays, { year, month: null }, genreResolver(genres.doc, data)),
      year,
      partial: year === now.getFullYear(),
      since: firstEver && firstEver >= start && firstEver < start + 366 * 86400 ? enDate(firstEver) : null,
    })
      .then((blob) => {
        if (!live) return
        made = URL.createObjectURL(blob)
        setImg({ blob, url: made })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [data, history.plays, genres.doc, year])

  const share = async () => {
    if (!img) return
    setBusy(true)
    try {
      const ok = await shareImage(img.blob, name, `My ${year} in music`)
      if (!ok) {
        saveImage(img.blob, name)
        toast.show({ icon: 'download', text: `Saved ${name}` })
      }
    } catch {
      toast.show({ icon: 'alert', mutedIcon: true, text: 'Couldn’t share the image.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Your ${year}, as an image`}
      subtitle="Story size · 1080 × 1920"
      icon="share"
      phone="full"
      className="recap-share-dialog"
      actions={
        <>
          {canSaveFile() && (
            <Button variant="ghost" disabled={!img} onClick={() => img && saveImage(img.blob, name)}>
              Save
            </Button>
          )}
          <Button variant="primary" disabled={!img || busy} onClick={() => void share()}>
            <Icon name="share" />
            Share
          </Button>
        </>
      }
    >
      <div className="recap-share-preview">{img ? <img src={img.url} alt={`Your ${year} in music`} /> : <span className="recap-share-wait">{failed ? 'Couldn’t make the image.' : 'Making your image…'}</span>}</div>
    </Dialog>
  )
}
