// Bundles src/index.ts (and the shared handlers in app/functions/api) into lib/index.js.
// Runs before every `firebase deploy --only functions` (firebase.json → predeploy).
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['firebase-functions', 'firebase-admin'],
  logLevel: 'info',
})
