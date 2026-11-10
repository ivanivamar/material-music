import { lazy, Suspense, useEffect, useState } from 'react'
import { ToastProvider } from './components/ui'
import { ErrorBoundary, PageError } from './components/ErrorBoundary'
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
import { concertsStore } from './state/concerts'
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
import { initPlayerSync } from './sync/playerSync'
import { initCloud } from './sync/cloud'
import { initSettingsSync } from './sync/settingsSync'
import { useSession } from './state/session'
import { NowPlayingHue } from './design/NowPlayingHue'
import { initDiscovery } from './state/discovery'

/*
 * Pages other than Home are separate chunks, loaded the first time they are opened (and warmed up
 * in the background a few seconds after boot, so a first visit doesn't wait on the network). The
 * service worker precaches every chunk, so they open offline as before. All CSS stays in the one
 * main stylesheet (styles/all.css).
 */
const load = {
  Library: () => import('./pages/library/Library'),
  AlbumPage: () => import('./pages/library/AlbumPage'),
  ArtistPage: () => import('./pages/library/ArtistPage'),
  PlaylistPage: () => import('./pages/playlists/PlaylistPage'),
  MixPage: () => import('./pages/mix/MixPage'),
  NewReleases: () => import('./pages/releases/NewReleases'),
  Concerts: () => import('./pages/concerts/Concerts'),
  Upload: () => import('./pages/upload/Upload'),
  Downloads: () => import('./pages/downloads/Downloads'),
  Stats: () => import('./pages/stats/Stats'),
  Settings: () => import('./pages/settings/Settings'),
  Health: () => import('./pages/health/Health'),
}
const Library = lazy(() => load.Library().then((m) => ({ default: m.Library })))
const AlbumPage = lazy(() => load.AlbumPage().then((m) => ({ default: m.AlbumPage })))
const ArtistPage = lazy(() => load.ArtistPage().then((m) => ({ default: m.ArtistPage })))
const PlaylistPage = lazy(() => load.PlaylistPage().then((m) => ({ default: m.PlaylistPage })))
const MixPage = lazy(() => load.MixPage().then((m) => ({ default: m.MixPage })))
const NewReleases = lazy(() => load.NewReleases().then((m) => ({ default: m.NewReleases })))
const Concerts = lazy(() => load.Concerts().then((m) => ({ default: m.Concerts })))
const Upload = lazy(() => load.Upload().then((m) => ({ default: m.Upload })))
const Downloads = lazy(() => load.Downloads().then((m) => ({ default: m.Downloads })))
const Stats = lazy(() => load.Stats().then((m) => ({ default: m.Stats })))
const Settings = lazy(() => load.Settings().then((m) => ({ default: m.Settings })))
const Health = lazy(() => load.Health().then((m) => ({ default: m.Health })))
// dev reference pages (#/dev/…): never warmed up, only fetched when opened
const Components = lazy(() => import('./dev/Components').then((m) => ({ default: m.Components })))
const Foundations = lazy(() => import('./dev/Foundations').then((m) => ({ default: m.Foundations })))

// warm the page chunks once the app has settled (a failure here is retried when the page is opened)
window.setTimeout(() => {
  for (const fn of Object.values(load)) void fn().catch(() => {})
}, 4000)

// The first, local-only likes (Oct 2026, dropped): clear that old store. Liked songs now live in
// the synced Liked songs playlist (state/playlists.ts LIKED_ID).
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
// Home (step 8): play history — counted from the player, synced through Firestore (step 39).
historyStore.init()
initPlayTracker()
// Android: offline downloads (phase D) — keeps the phone's stored files in line with the pins.
downloadsStore.init()
// New releases (step 11): daily MusicBrainz sweep, feed + marks synced through Drive releases.json.
releasesStore.init()
// Playlists (step 9): one Firestore doc per playlist (step 39), edited offline-first and merged entry by entry.
playlistsStore.init()
// Genres (step 20b): tags, else set in the app, else MusicBrainz — synced through Drive genres.json.
genresStore.init()
// DJ (step 22): sessions in the player queue; what it has learned synced through Firestore (step 39).
djStore.init()
initDjLive()
// Home v2 (step 26): Jump back in synced through Firestore (step 39); radio keeps its queue filled.
recentStore.init()
initRadio()
// Android: the home screen widget — its info (playing from, mixes…) and the taps the app performs.
initWidget()
// Android: release-day notifications for New Releases reminders, even with the app closed.
initReleaseNotifications()
// New Releases → Discover: recent releases by related artists who aren't in the library.
initDiscover()
// Discovery mix (Nov 2026): this week's previews + wishlist, so a restored queue knows its songs
initDiscovery()
// Concerts: Ticketmaster tour dates once a day; home city + hand-added shows synced through Drive concerts.json.
concertsStore.init()
// Player sync (step 37): queue + playback shared between PC and phone through Firestore; remote control.
initPlayerSync()
// Cloud data (step 39): history, Jump back in, DJ, playlists and shared settings live in Firestore.
initSettingsSync()
initCloud()

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
    case 'concerts':
      return <Concerts />
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
  if (route.kind === 'dev') screen = <Suspense fallback={null}>{route.key === 'dev/foundations' ? <Foundations /> : <Components />}</Suspense>
  else if (session.status === 'signed-out') screen = <SignIn />
  else if (!lib.cacheChecked) screen = <div className="scr" />
  else if (lib.data && !charting) screen = (
    <AppShell route={route}>
      {/* a page that throws shows PageError in its place; the player and navigation stay up */}
      <ErrorBoundary resetKey={JSON.stringify(route)} fallback={(error, reset) => <PageError error={error} reset={reset} />}>
        <Suspense fallback={null}>
          <Page route={route} />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
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
