#!/usr/bin/env bash
set -euo pipefail

# UI checks
docker run --rm -v "$PWD/ui:/src" -w /src node:20.19.5-slim \
  sh -c 'npm ci && npm run build && npm run lint'

# Isolated MediaMTX test stack: no host ports are published.
compose=(docker compose -p tapes-test -f test/docker-compose.yml)
export MEDIAMTX_PASS='test-only-password'
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
cleanup
trap cleanup EXIT
"${compose[@]}" up -d

curl_stack() {
  "${compose[@]}" run --rm --no-deps --entrypoint curl curl --silent --show-error "$@"
}

# Wait for a complete recording segment and a ready stream.
ready=false
for _ in $(seq 1 90); do
  paths=$(curl_stack -u "tapes:${MEDIAMTX_PASS}" http://mediamtx:9997/v3/paths/list 2>/dev/null || true)
  if printf '%s' "$paths" | grep -q '"ready":true' && \
      docker run --rm --network "tapes-test_default" -v tapes-test-recordings:/recordings alpine:3.21 sh -c 'find /recordings -type f | grep -q .' 2>/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true

test "$(curl_stack -o /dev/null -w '%{http_code}' -u "tapes:${MEDIAMTX_PASS}" 'http://mediamtx:9996/list?path=test')" = 200
test "$(curl_stack -o /dev/null -w '%{http_code}' -u 'tapes:wrong-password' 'http://mediamtx:9996/list?path=test')" = 401
test "$(curl_stack -o /dev/null -w '%{http_code}' 'http://mediamtx:9996/list?path=test')" = 401

paths=$(curl_stack -fsS -u "tapes:${MEDIAMTX_PASS}" http://mediamtx:9997/v3/paths/list)
printf '%s' "$paths" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).items.find(x=>x.name==="test");if(!p?.ready||p.tracks2?.[0]?.codec!=="H264"||p.tracks2[0].codecProps.width!==640||p.tracks2[0].codecProps.height!==360)process.exit(1)})'
test "$(curl_stack -o /dev/null -w '%{http_code}' http://mediamtx:9997/v3/paths/list)" = 401

headers=$(curl_stack -D - -o /dev/null http://mediamtx:8888/test/index.m3u8)
printf '%s' "$headers" | grep -Eiq '^HTTP/[^ ]+ 302'
printf '%s' "$headers" | grep -Eiq '^location: /test/index\.m3u8\?cookieCheck=1'

# The anonymous internal user can read but cannot publish.
if "${compose[@]}" run --rm --no-deps publisher -re -f lavfi -i testsrc=size=64x64:rate=1 -t 1 -c:v libx264 -f rtsp rtsp://mediamtx:8554/intruder >/dev/null 2>&1; then
  echo 'unexpectedly published to intruder' >&2
  exit 1
fi
