// Songs with several artists: lib/songArtists.ts. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { songArtists, nameKey } from '../src/lib/songArtists.ts'
import type { Catalogue } from '../src/state/library.ts'

const names = ['Night Tide', 'Kiri no Oto', 'Tyler, The Creator', 'Earth, Wind & Fire', 'Beyoncé', 'Simon & Garfunkel', 'Rosalía', '宇多田ヒカル']
const lib = {
  version: 1,
  updatedAt: null,
  artists: Object.fromEntries(names.map((n, i) => [`a${i}`, { id: `a${i}`, name: n, addedAt: '' }])),
  albums: {},
  tracks: {},
} as unknown as Catalogue
const id = (n: string) => `a${names.indexOf(n)}`
const run = (artist: string, main = 'Night Tide') => songArtists({ artist, artistId: id(main) }, lib).map((a) => `${a.name}${a.id ? '' : '?'}`)

test('one artist stays one', () => {
  assert.deepEqual(run('Night Tide'), ['Night Tide'])
  assert.deepEqual(run('Tyler, The Creator', 'Tyler, The Creator'), ['Tyler, The Creator'])
  assert.deepEqual(run('Earth, Wind & Fire', 'Earth, Wind & Fire'), ['Earth, Wind & Fire'])
  assert.deepEqual(run('Simon & Garfunkel', 'Simon & Garfunkel'), ['Simon & Garfunkel'])
})

test('comma, ampersand, feat., x', () => {
  assert.deepEqual(run('Night Tide, Kiri no Oto'), ['Night Tide', 'Kiri no Oto'])
  assert.deepEqual(run('Night Tide & Kiri no Oto'), ['Night Tide', 'Kiri no Oto'])
  assert.deepEqual(run('Night Tide feat. Kiri no Oto'), ['Night Tide', 'Kiri no Oto'])
  assert.deepEqual(run('Night Tide ft Kiri no Oto'), ['Night Tide', 'Kiri no Oto'])
  assert.deepEqual(run('Night Tide (feat. Kiri no Oto)'), ['Night Tide', 'Kiri no Oto'])
  assert.deepEqual(run('Night Tide x Kiri no Oto'), ['Night Tide', 'Kiri no Oto'])
  assert.deepEqual(run('Night Tide、宇多田ヒカル'), ['Night Tide', '宇多田ヒカル'])
})

test('names with separators inside stay whole', () => {
  assert.deepEqual(run('Night Tide, Tyler, The Creator & Kiri no Oto'), ['Night Tide', 'Tyler, The Creator', 'Kiri no Oto'])
  assert.deepEqual(run('Earth, Wind & Fire feat. Night Tide', 'Earth, Wind & Fire'), ['Earth, Wind & Fire', 'Night Tide'])
})

test('artists not in the library', () => {
  assert.deepEqual(run('Night Tide, Kiri no Oto, Mira Vell'), ['Night Tide', 'Kiri no Oto', 'Mira Vell?'])
  assert.deepEqual(run('Night Tide feat. Some Band'), ['Night Tide', 'Some Band?'])
})

test('accents and case', () => {
  assert.deepEqual(run('Night Tide & Beyonce'), ['Night Tide', 'Beyonce'])
  assert.equal(songArtists({ artist: 'NIGHT TIDE & rosalia', artistId: id('Night Tide') }, lib)[1].id, id('Rosalía'))
  assert.equal(nameKey("Guns N' Roses"), 'guns n roses')
})

test('main artist first, even when listed later or spelled differently', () => {
  assert.deepEqual(run('Kiri no Oto, Night Tide'), ['Night Tide', 'Kiri no Oto'])
  // main artist spelled another way in the tag: the first unknown name becomes the main artist
  const r = songArtists({ artist: 'Nite Tide, Kiri no Oto', artistId: id('Night Tide') }, lib)
  assert.deepEqual(r.map((a) => a.id), [id('Night Tide'), id('Kiri no Oto')])
})

test('duplicates are dropped', () => {
  assert.deepEqual(run('Night Tide, Kiri no Oto & Kiri no Oto'), ['Night Tide', 'Kiri no Oto'])
})
