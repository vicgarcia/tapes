#!/usr/bin/env bash
# starting version: UI checks only, later issues extend it
set -euo pipefail
docker run --rm -v "$PWD/ui:/src" -w /src node:20.19.5-slim \
  sh -c 'npm ci && npm run build && npm run lint'
