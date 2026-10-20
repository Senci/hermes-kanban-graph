#!/bin/sh
# Rebuild desktop/plugin.js from desktop/src with the pinned esbuild, from a plain checkout.
# Installs esbuild 0.28.2 (integrity-checked by esbuild-lock.json) into a cache directory outside
# the plugin tree, so the plugin never carries a package.json, then runs scripts/build.mjs.
# Needs node and npm; registry.npmjs.org on the first run.
#
# Usage: sh scripts/rebuild.sh        (KANBAN_GRAPH_BUILD_DIR overrides the cache directory)
set -eu

here=$(cd "$(dirname "$0")" && pwd)
cache=${KANBAN_GRAPH_BUILD_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/kanban-graph-build}

mkdir -p "$cache"
cat > "$cache/package.json" <<'JSON'
{
  "name": "kanban-graph-build",
  "private": true,
  "devDependencies": {
    "esbuild": "0.28.2"
  }
}
JSON
cp "$here/esbuild-lock.json" "$cache/package-lock.json"
(cd "$cache" && npm ci --ignore-scripts --no-audit --no-fund)

ESBUILD_DIR=$cache node "$here/build.mjs"
