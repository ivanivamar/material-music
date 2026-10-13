# Pelagic

A personal music player for my own FLAC library — the same library on PC and Android, playable offline, with no server and no PC that needs to stay on.

## How it works

```
 C:\Users\ivani\Music  ──(import script)──▶  Google Drive /Pelagic  ◀──▶  Pelagic app (PC + Android)
   FLAC originals                              FLAC + Opus + covers        streams or plays offline
                                               + library.json
```

- **Google Drive is the master copy.** It holds the FLAC originals, 160 kbps Opus phone copies (~5x smaller), album covers and a `library.json` catalogue.
- **PC** plays the FLAC files from the local Google Drive folder.
- **Android** downloads the Opus copies for offline playback (whole library fits in a few GB) and streams anything not downloaded. Original FLAC can be downloaded per album.
- **Playlists and listening history** are stored as small JSON files in Drive, so both devices stay in sync.

## Features

- [x] Library import to Drive (tags, covers, phone copies, synced lyrics)
- [ ] Player: queue, seek, lock-screen controls
- [ ] Home: recently listened, recently added, most played
- [ ] Library: artists, albums, songs
- [ ] Search (my library only)
- [ ] Android app with offline downloads
- [ ] Playlists
- [ ] Synced lyrics view
- [ ] Upload new music from the app
- [ ] New releases from my artists (MusicBrainz)

## Repo layout

| Path | What |
|---|---|
| `tools/import/` | Node script that syncs the local library to Drive — see its [README](tools/import/README.md) |
| `app/` | The Pelagic app (Vite + React + TypeScript, Capacitor for Android) — *coming next* |
| `secrets/` | Google OAuth client + tokens (git-ignored, never committed) |

## Drive layout

```
Pelagic/
  library/Artist/Album/NN - Title.flac   # originals
  mobile/Artist/Album/NN - Title.opus    # phone copies
  covers/<albumId>.jpg                   # 600px album art
  library.json                           # catalogue
```

## Getting started

1. Google Cloud project with the **Drive API** enabled and two OAuth clients:
   - **Pelagic Import** (Desktop) → JSON saved as `secrets/client_desktop.json`
   - **Pelagic Web** (Web application, origin `http://localhost:5173`)
2. Install **Node.js 20+**.
3. Import the library:
   ```
   cd tools/import
   npm install
   npm run dry-run
   npm run import
   ```
   Re-run `npm run import` whenever new music is added — unchanged files are skipped and nothing is ever deleted from Drive.

## Tech

Vite · React · TypeScript · Capacitor (Android) · Google Drive API · music-metadata · ffmpeg (Opus encoding) · MusicBrainz API
