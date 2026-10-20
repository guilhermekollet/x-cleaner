#!/bin/bash
# Runs the test suite. Node 20+ (for the global File class and DecompressionStream).
set -euo pipefail
cd "$(dirname "$0")/.."
node --test
