import { useEffect, useState } from 'react'
import { ToastProvider } from './components/ui'
import { Components } from './dev/Components'
import { Foundations } from './dev/Foundations'
import { initDriveStream } from './lib/driveStream'
import { initPwa } from './lib/pwa'
import { initNativeUpdates } from './native/updates'
import { initBackButton } from './native/backButton'
import { Home } from './pages/Home'
import { Placeholder } from './pages/Placeholder'
import { LibraryError, LoadingLibrary, NoLibrary } from './screens/LibraryStatus'
import { createHtmlAudioEngine } from './player/htmlEngine'
import { createNativeEngine } from './player/nativeEngine'
import { isNative } from './native/bridge'
import { SignIn } from './screens/SignIn'
import { AppShell } from './shell/AppShell'
import { useRoute, type Route } from './shell/routes'
import { AlbumPage } from './pages/library/AlbumPage'
import { ArtistPage } from './pages/library/ArtistPage'
import { Library } from './pages/library/Library'
import { Search } from './pages/search/Search'
import { libraryStore, useLibrary } from './state/library'
import { useMotionAttribute } from './state/motion'
import { playerStore } from './state/player'
import { useSession } from './state/session'

// Liked songs were dropped (Oct 2026): clear the old local store once.
try {
  localStorage.removeItem('pelagic.likes.v1')
} catch {
  /* storage unavailable */
}
// The cached catalogue is local data: read it at boot, before (and regardless of) the session.
void libraryStore.loadCache()
// Player core (3d): HTML audio engine + the service worker that streams from Drive.
void initDriveStream()
// PWA (step 7): update toast, install prompt, launches into the open window.
initPwa()
// Android app: check GitHub Releases for a newer APK.
initNativeUpdates()
// Android: the system Back button navigates inside the app instead of closing it.
initBackButton()
// Android: ExoPlayer in a background service (phase C) instead of HTML audio.
playerStore.attach(isNative ? createNativeEngine() : createHtmlAudioEngine())

function Page({ route }: { route: Extract<Route, { kind: 'app' }> }) {
  switch (route.key) {
    case 'home':
      return <Home />
    case 'library':
      return <Library tab={route.tab} />
    case 'album':
      return <AlbumPage key={route.id} id={route.id} />
    case 'artist':
      return <ArtistPage key={route.id} id={route.id} />
    case 'search':
      return <Search />
    case 'new':
      return <Placeholder title="New releases" meta="MUSICBRAINZ · DAILY" icon="newr" line="No sweep has run yet." body="The MusicBrainz feed for the artists you follow arrives in step 11." />
    case 'upload':
      return <Placeholder title="Upload" meta="FLAC → DRIVE + OPUS" icon="upload" line="Use the importer for now." body="Run tools/import on your PC (npm run import). In-app upload arrives in step 10." />
    case 'downloads':
      return <Placeholder title="Downloads" meta="OFFLINE · ANDROID" icon="download" line="Nothing stored offline." body="Offline downloads come with the Android build in step 7." />
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
  else if (lib.data && !charting) screen = <AppShell route={route}><Page route={route} /></AppShell>
  else if (session.status === 'expired') screen = <SignIn expired />
  else if (lib.status === 'missing') screen = <NoLibrary />
  else if (lib.status === 'error') screen = <LibraryError />
  else screen = <LoadingLibrary onDone={() => setCharting(false)} />

  return <ToastProvider className={inShell ? 'toasts-shell' : undefined}>{screen}</ToastProvider>
}
