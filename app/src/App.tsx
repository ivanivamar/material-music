import { useEffect, useState } from 'react'
import { ToastProvider } from './components/ui'
import { Components } from './dev/Components'
import { Foundations } from './dev/Foundations'
import { initDriveStream } from './lib/driveStream'
import { initPwa } from './lib/pwa'
import { initNativeUpdates } from './native/updates'
import { initBackButton } from './native/backButton'
import { initWidget } from './native/widget'
import { initReleaseNotifications } from './native/releaseNotify'
import { Home } from './pages/Home'
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
import { Downloads } from './pages/downloads/Downloads'
import { Upload } from './pages/upload/Upload'
import { Stats } from './pages/stats/Stats'
import { Settings } from './pages/settings/Settings'
import { Health } from './pages/health/Health'
import { NewReleases } from './pages/releases/NewReleases'
import { PlaylistPage } from './pages/playlists/PlaylistPage'
import { MixPage } from './pages/mix/MixPage'
import { recentStore } from './state/recent'
import { initRadio } from './state/radio'
import { playlistsStore } from './state/playlists'
import { downloadsStore } from './state/downloads'
import { libraryStore, useLibrary } from './state/library'
import { useMotionAttribute } from './state/motion'
import { playerStore } from './state/player'
import { genresStore } from './state/genres'
import { djStore } from './state/dj'
import { initDjLive } from './dj/live'
import { historyStore } from './state/history'
import './state/removal'
import { releasesStore } from './state/releases'
import { initDiscover } from './state/discover'
import { initPlayTracker } from './player/playTracker'
import { useSession } from './state/session'
import { NowPlayingHue } from './design/NowPlayingHue'

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
// Home (step 8): play history — counted from the player, synced through Drive history.json.
historyStore.init()
initPlayTracker()
// Android: offline downloads (phase D) — keeps the phone's stored files in line with the pins.
downloadsStore.init()
// New releases (step 11): daily MusicBrainz sweep, feed + marks synced through Drive releases.json.
releasesStore.init()
// Playlists (step 9): one Drive file per playlist, edited offline-first and merged entry by entry.
playlistsStore.init()
// Genres (step 20b): tags, else set in the app, else MusicBrainz — synced through Drive genres.json.
genresStore.init()
// DJ (step 22): sessions in the player queue; what it has learned synced through Drive dj.json.
djStore.init()
initDjLive()
// Home v2 (step 26): Jump back in synced through Drive recent.json; radio keeps its queue filled.
recentStore.init()
initRadio()
// Android: the home screen widget — its info (playing from, mixes…) and the taps the app performs.
initWidget()
// Android: release-day notifications for New Releases reminders, even with the app closed.
initReleaseNotifications()
// New Releases → Discover: recent releases by related artists who aren't in the library.
initDiscover()

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
    case 'playlist':
      return <PlaylistPage key={route.id} id={route.id} />
    case 'mix':
      return <MixPage key={route.id} id={route.id} />
    case 'new':
      return <NewReleases />
    case 'upload':
      return <Upload />
    case 'downloads':
      return <Downloads />
    case 'stats':
      return <Stats period={route.period} />
    case 'settings':
      return <Settings />
    case 'health':
      return <Health />
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

  return (
    <ToastProvider className={inShell ? 'toasts-shell' : undefined}>
      <NowPlayingHue />
      {screen}
    </ToastProvider>
  )
}
