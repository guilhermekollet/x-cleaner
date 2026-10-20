#!/bin/bash
# Builds the unpacked extension into a .zip ready to install, upload to the Chrome Web Store or
# attach to a GitHub release. It writes two copies: one named after the version, and
# x-cleaner.zip, the stable name the website's download button points at.
set -euo pipefail
cd "$(dirname "$0")/.."

version="$(node -p "require('./manifest.json').version")"
out="dist/x-cleaner-${version}.zip"

node scripts/make-icons.mjs
rm -rf dist
mkdir -p dist

zip -r -q "$out" manifest.json _locales src icons fonts -x '*.DS_Store'
cp "$out" dist/x-cleaner.zip
echo "Built $out (and dist/x-cleaner.zip)"
(cd dist && shasum -a 256 "x-cleaner-${version}.zip" | tee "x-cleaner-${version}.zip.sha256")
