/** Check Drive for changes: the catalogue and every synced file (account menu, Settings → Library). */
import { genresStore } from './genres'
import { historyStore } from './history'
import { libraryStore } from './library'
import { playlistsStore } from './playlists'
import { releasesStore } from './releases'

export function checkDrive() {
  void libraryStore.sync({ force: true })
  void historyStore.sync()
  void releasesStore.sync()
  void playlistsStore.sync()
  void genresStore.sync().then(() => genresStore.fill())
}
