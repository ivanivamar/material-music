import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Short commit id for the "version" line in the account menu (CI: GITHUB_SHA). */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'local'
  }
}

/**
 * Fills the precache list into dist/sw.js after the build (public/sw.js keeps BUILD = null in dev,
 * which turns all offline caching off so the Vite dev server is never shadowed).
 *
 * Precached (the app opens offline right after install): index.html, JS, CSS, manifest, icons,
 * Latin font subsets and the self-hosted General Sans. Everything else under assets/ (CJK and other
 * font subsets, dev-page images) is cached the first time it's used.
 */
function pelagicServiceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'pelagic-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      // a failed build never wrote the folder: stay quiet so the real build error is what gets reported
      if (!existsSync(outDir)) return
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.gitkeep'))
        .sort()
      const precache = files.filter(
        (f) =>
          f === 'index.html' ||
          f === 'manifest.webmanifest' ||
          f === 'favicon.svg' ||
          f.startsWith('icons/') ||
          /^assets\/.+\.(js|css)$/.test(f) ||
          /^assets\/.+-latin(-ext)?-\d+-normal-.+\.woff2$/.test(f) ||
          /^fonts\/.+\.woff2$/.test(f),
      )
      const hash = createHash('sha256')
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)))
      const build = hash.digest('hex').slice(0, 12)
      const assets = files.filter((f) => f.startsWith('assets/') || f.startsWith('fonts/'))

      const swPath = join(outDir, 'sw.js')
      let sw = readFileSync(swPath, 'utf8')
      const fill = (marker: string, value: unknown) => {
        const re = new RegExp(`/\\*${marker}\\*/[^\\n]*`)
        if (!re.test(sw)) throw new Error(`pelagic-sw: marker ${marker} missing from sw.js`)
        sw = sw.replace(re, `${JSON.stringify(value)}`)
      }
      fill('BUILD', build)
      fill('PRECACHE', precache)
      fill('ASSETS', assets)
      writeFileSync(swPath, sw)
      this.info?.(`service worker: build ${build}, ${precache.length} files precached, ${assets.length} assets known`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pelagicServiceWorker()],
  define: {
    __PELAGIC_VERSION__: JSON.stringify(`${new Date().toISOString().slice(0, 10)} · ${commit()}`),
  },
  server: {
    port: 5173, // must match the "Pelagic Web" OAuth client origin
    strictPort: true,
    // dev gallery pages import sample covers from ../design_handoff_pelagic/art
    fs: { allow: ['..'] },
  },
})
