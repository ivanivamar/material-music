import { useEffect, useState } from 'react'
import { ToastProvider } from './components/ui'
import { Components } from './dev/Components'
import { Foundations } from './dev/Foundations'
import { initDriveStream } from './lib/driveStream'
import { Home } from './pages/Home'
import { Placeholder } from './pages/Placeholder'
import { LibraryError, LoadingLibrary, NoLibrary } from './screens/LibraryStatus'
import { createHtmlAudioEngine } from './player/htmlEngine'
import { SignIn } from './screens/SignIn'
import { AppShell } from './shell/AppShell'
import { useRoute, type RouteKey } from './shell/routes'
import { libraryStore, useLibrary } from './state/library'
import { useMotionAttribute } from './state/motion'
import { playerStore } from './state/player'
import { useSession } from './state/session'

// The cached catalogue is local data: read it at boot, before (and regardless of) the session.
void libraryStore.loadCache()
// Player core (3d): HTML audio engine + the service worker that streams from Drive.
void initDriveStream()
playerStore.attach(createHtmlAudioEngine())

function Page({ route }: { route: RouteKey }) {
  switch (route) {
    case 'home':
      return <Home />
    case 'library':
      return <Placeholder title="Library" meta="ARTISTS · ALBUMS · SONGS" icon="library" line="The shelves go up next." body="Artists, albums and songs from your catalogue arrive in step 4." />
    case 'search':
      return <Placeholder title="Search" meta="CLIENT-SIDE · WHOLE CATALOGUE" icon="search" line="Nothing to search yet." body="Search over the catalogue arrives in step 5." />
    case 'new':
      return <Placeholder title="New releases" meta="MUSICBRAINZ · DAILY" icon="newr" line="No sweep has run yet." body="The MusicBrainz feed for the artists you follow arrives in step 11." />
    case 'upload':
      return <Placeholder title="Upload" meta="FLAC → DRIVE + OPUS" icon="upload" line="Use the importer for now." body="Run tools/import on your PC (npm run import). In-app upload arrives in step 10." />
    case 'downloads':
      return <Placeholder title="Downloads" meta="OFFLINE · ANDROID" icon="download" line="Nothing stored offline." body="Offline downloads come with the Android build in step 6." />
    case 'liked':
      return <Placeholder title="Liked songs" meta="AUTO PLAYLIST" icon="heart" line="Hearts are saved on this device." body="The Liked songs page and its Drive sync (liked.json) arrive with playlists in step 8." />
  }
}

export default function App() {
  useMotionAttribute()
  const route = useRoute()
  const session = useSession()
  const lib = useLibrary()
  // After a first sync, stay on "All charted." until the user continues.
  const [charting, setCharting] = useState(false)
  if (lib.status === 'loading' && !charting) setCharting(true)

  // First sign-in with no cached library: start the download.
  useEffect(() => {
    if (session.status === 'signed-in' && lib.status === 'idle') void libraryStore.sync()
  }, [session.status, lib.status])

  const inShell = route.kind === 'app' && lib.status === 'ready' && !charting && session.status !== 'signed-out'

  let screen
  if (route.kind === 'dev') screen = route.key === 'dev/foundations' ? <Foundations /> : <Components />
  else if (session.status === 'signed-out') screen = <SignIn />
  else if (!lib.cacheChecked) screen = <div className="scr" />
  else if (lib.data && !charting) screen = <AppShell route={route.key}><Page route={route.key} /></AppShell>
  else if (session.status === 'expired') screen = <SignIn expired />
  else if (lib.status === 'missing') screen = <NoLibrary />
  else if (lib.status === 'error') screen = <LibraryError />
  else screen = <LoadingLibrary onDone={() => setCharting(false)} />

  return <ToastProvider className={inShell ? 'toasts-shell' : undefined}>{screen}</ToastProvider>
}
