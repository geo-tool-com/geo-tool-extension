// Builds the extension into dist/. The scoring core in src/core is vendored
// byte-identical from the geo-tool.com engine — the extension computes exactly
// the same score as the website.

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, 'dist')

await mkdir(dist, { recursive: true })

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src', 'popup.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome110',
  outfile: path.join(dist, 'popup.js'),
  minify: process.argv.includes('--minify'),
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
})

await cp(path.join(root, 'src', 'popup.html'), path.join(dist, 'popup.html'))
await cp(path.join(root, 'src', 'popup.css'), path.join(dist, 'popup.css'))
await cp(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'))
await cp(path.join(root, 'icons'), path.join(dist, 'icons'), { recursive: true })
await cp(path.join(root, '_locales'), path.join(dist, '_locales'), { recursive: true })

// A network call in the bundle would be a cost leak: the extension may reach
// geo-tool.com only through links the user clicks themselves.
const bundle = await readFile(path.join(dist, 'popup.js'), 'utf8')
const forbidden = [/geo-tool\.com\/api/, /XMLHttpRequest/, /navigator\.sendBeacon/]
for (const pattern of forbidden) {
  if (pattern.test(bundle)) throw new Error(`Bundle contains a forbidden network path: ${pattern}`)
}

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0
await writeFile(path.join(dist, '.buildinfo'), `popup.js ${bytes} bytes\n`)
console.log(`Extension built -> dist/  (popup.js ${(bytes / 1024).toFixed(1)} KB)`)
