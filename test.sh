#!/usr/bin/env bash
set -euo pipefail
docker run --rm -v "$PWD/ui:/src" -w /src node:20.19.5-slim sh -c 'npm ci && npm run build && npm run lint'
# The UI build writes into api/dist, but the UI container has only the UI bind-mounted.
# Build it again with both repo paths mounted so the generated embed assets are available.
docker run --rm -v "$PWD/ui:/src/ui" -v "$PWD/api:/src/api" -w /src/ui node:20.19.5-slim sh -c 'npm ci && npm run build'
docker run --rm -v "$PWD/api:/src" -w /src golang:1.26.10-bookworm sh -c 'go vet ./... && go test ./...'
docker build -t tapes:test .
compose=(docker compose -p tapes-test -f test/docker-compose.yml)
export MEDIAMTX_PASS=test-only-password
cleanup(){ "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
cleanup; trap cleanup EXIT
"${compose[@]}" up -d
curl_stack(){ "${compose[@]}" run --rm --no-deps --entrypoint curl curl --silent --show-error "$@"; }
ready=false
for _ in $(seq 1 90); do
 if curl_stack -fsS -u "tapes:$MEDIAMTX_PASS" http://mediamtx:9997/v3/paths/list 2>/dev/null | grep -q '"ready":true'; then ready=true; break; fi
 sleep 1
done
test "$ready" = true
api_curl(){ "${compose[@]}" run --rm --no-deps --entrypoint curl curl --silent --show-error "$@"; }
test "$(api_curl -o /dev/null -w '%{http_code}' http://tapes:8671/health)" = 200
for path in /auth /logout /cameras /cameras/nope /cameras/test/live/index.m3u8; do
 method=GET; [[ "$path" == /logout ]] && method=POST
 test "$(api_curl -X "$method" -o /dev/null -w '%{http_code}' "http://tapes:8671$path")" = 401
done
login_cookie=$(api_curl -D - -o /dev/null -d 'username=test&password=test' http://tapes:8671/login | awk 'BEGIN{IGNORECASE=1}/^Set-Cookie: tapes=/{sub("^Set-Cookie: tapes=","");sub(";.*","");print;exit}' | tr -d '\r')
test -n "$login_cookie"
api_auth(){ api_curl -H "Cookie: tapes=$login_cookie" "$@"; }
api_auth -fsS http://tapes:8671/cameras | grep -q '"name":"test"'
api_auth -fsS http://tapes:8671/cameras | grep -q '"width":640'
test "$(api_auth -o /dev/null -w '%{http_code}' http://tapes:8671/cameras/nope)" = 404
api_auth -fsS http://tapes:8671/cameras/test/live/index.m3u8 | grep -q '#EXTM3U'
