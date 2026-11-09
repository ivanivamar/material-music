// Bundles src/index.ts and its handlers (src/api/*) into lib/index.js.
// Runs before every functions deploy (firebase.json → predeploy), locally or in the Firebase workflow.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // kuromoji reads its dictionary files from node_modules at run time: installed on deploy, not bundled
  external: ['firebase-functions', 'firebase-admin', 'kuromoji'],
  logLevel: 'info',
})
