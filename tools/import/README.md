# Pelagic import

Syncs your local FLAC library to Google Drive (`/Pelagic`) for the Pelagic app:

- `library/Artist/Album/*.flac` — originals
- `mobile/Artist/Album/*.opus` — 160 kbps phone copies (~5x smaller)
- `covers/<albumId>.jpg` — 600px album art
- `library.json` — catalogue (artists, albums, tracks, Drive file IDs, lyrics)

Safe to re-run: unchanged files are skipped, nothing is ever deleted from Drive.

## Setup (once)

1. Install **Node.js 20+** (https://nodejs.org). ffmpeg is bundled — nothing else to install.
2. Save the Google Cloud **Desktop** OAuth client JSON as `D:\pelagic\secrets\client_desktop.json`.
3. In this folder:
   ```
   cd D:\pelagic\tools\import
   npm install
   ```

## Run

```
npm run dry-run       # scan + read tags only, shows albums/warnings
npm run import        # sync to Drive (first run opens a browser to sign in)
```

Options (after `--`, e.g. `npm run import -- --limit 5`):

| Option | Meaning |
|---|---|
| `--music <dir>` | Source folder (default `C:\Users\ivani\Music`) |
| `--limit <n>` | Only the first n files (good for a first test) |
| `--out <dir>` | Write to a local folder instead of Drive |
| `--force` | Re-process everything |
| `--concurrency <n>` | Parallel tracks (default 2) |
| `--bitrate <rate>` | Opus bitrate (default `160k`) |
