#!/bin/bash
# Builds the unpacked extension into a .zip ready to upload to the Chrome Web Store,
# or to attach to a GitHub release for manual install. Regenerates the icons first.
set -euo pipefail
cd "$(dirname "$0")/.."

version="$(node -p "require('./manifest.json').version")"
out="dist/x-cleaner-${version}.zip"

node scripts/make-icons.mjs
rm -rf dist
mkdir -p dist

zip -r -q "$out" manifest.json src icons -x '*.DS_Store'
echo "Built $out"
shasum -a 256 "$out" | tee "${out}.sha256"
