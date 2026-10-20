// Build desktop/plugin.js from desktop/src with the pinned esbuild. This is the canonical build:
// the committed bundle is exactly this script's output, and CI rebuilds it and fails on any diff.
//
// Usage: node scripts/build.mjs            esbuild is found next to the repo (node_modules)
//        sh scripts/rebuild.sh             installs the pinned esbuild into a cache dir, then builds
//
// Flags: ESM, es2022, automatic JSX, no minify (the bundle is reviewed and diffed). The host injects
// '@hermes/plugin-sdk', 'react' and 'react/jsx-runtime', so they stay external. --legal-comments=inline
// keeps the two `@preserve` layout markers (desktop/src/layout-start.js, layout-end.js) that
// snapshot/kanban_graph.py and tests/layout.test.mjs slice the bundle on.

import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PINNED = '0.28.2'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lookup = process.env.ESBUILD_DIR ? join(resolve(process.env.ESBUILD_DIR), 'noop.js') : join(root, 'noop.js')

let esbuild
try {
  esbuild = createRequire(lookup)('esbuild')
} catch {
  console.error(`FAIL: esbuild ${PINNED} not found; run: sh scripts/rebuild.sh`)
  process.exit(1)
}
if (esbuild.version !== PINNED) {
  console.error(`FAIL: esbuild ${esbuild.version} found, the build is pinned to ${PINNED}; run: sh scripts/rebuild.sh`)
  process.exit(1)
}

esbuild.buildSync({
  entryPoints: [join(root, 'desktop', 'src', 'index.js')],
  outfile: join(root, 'desktop', 'plugin.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  charset: 'utf8',
  legalComments: 'inline',
  logLevel: 'warning',
  // The `// desktop/src/...` banners are relative to the plugin root, not the machine's cwd.
  absWorkingDir: root,
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']
})
console.log('built desktop/plugin.js')
