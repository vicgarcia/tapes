#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
source test/checks.sh
stage=${1:-all}
if (( $# > 1 )) || [[ ! "$stage" =~ ^(all|ui|api|stack)$ ]]; then
 echo 'Usage: ./test.sh [ui|api|stack]' >&2
 exit 2
fi
started=$SECONDS
step=setup
step_started=$SECONDS
scratch=$(mktemp -d)
export TMPDIR="$scratch"
project="tapes-test-$$"
workspace="$project-workspace"
image="tapes-test:$$"
compose=(docker compose --ansi never -p "$project" -f test/docker-compose.yml)
export MEDIAMTX_PASS=test-only-password TAPES_TEST_IMAGE="$image"
volume_created=false
image_created=false
stack_started=false
container="$project-worker"
cleanup() {
 local status=$?
 trap - EXIT ERR
 if (( status != 0 )); then
  printf 'FAIL in step: %s\n' "$step" >&2
  if [[ "$stack_started" == true ]]; then
   for service in mediamtx tapes; do
    printf '%s logs (last 50 lines):\n' "$service" >&2
    "${compose[@]}" logs --no-color --tail 50 "$service" >&2 || true
   done
  fi
  printf 'Time: %s %ss\n' "$step" "$((SECONDS-step_started))"
  step=teardown
  step_started=$SECONDS
 fi
 local cleanup_status=0
 docker rm -f "$container" >/dev/null 2>&1 || true
 if [[ "$stack_started" == true ]]; then
  "${compose[@]}" down --volumes --remove-orphans || cleanup_status=$?
 fi
 if [[ "$volume_created" == true ]]; then
  docker volume rm "$workspace" >/dev/null || cleanup_status=$?
 fi
 if [[ "$image_created" == true ]]; then
  docker image rm "$image" >/dev/null || cleanup_status=$?
 fi
 rm -rf "$scratch"
 if (( status == 0 && cleanup_status != 0 )); then
  echo 'FAIL in step: teardown' >&2
  status=$cleanup_status
 fi
 printf 'Time: %s %ss\nTotal: %ss\n' "$step" "$((SECONDS-step_started))" "$((SECONDS-started))"
 exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
run_step() {
 step=$1
 shift
 step_started=$SECONDS
 printf '\nStep: %s\n' "$step"
 "$@"
 printf 'Time: %s %ss\n' "$step" "$((SECONDS-step_started))"
 step=teardown
 step_started=$SECONDS
}
create_workspace() {
 docker volume create "$workspace" >/dev/null
 volume_created=true
}
ui() {
 docker run --rm --name "$container" -v "$PWD:/repo:ro" -v "$workspace:/src" -w /src node:20.19.5-slim bash -euc '
  source /repo/test/checks.sh
  check "Assertion helper tests" exit "exit 0" bash /repo/test/checks-test.sh
  mkdir /src/ui
  tar -C /repo/ui --exclude=node_modules --exclude=dist --exclude="*.tsbuildinfo" -cf - . | tar -C /src/ui -xf -
  mkdir -p /src/api
  cd /src/ui
  check "UI dependencies" exit "exit 0" npm ci
  check "UI build into api/dist" exit "exit 0" npm run build
  check "UI lint" exit "exit 0" npm run lint
 '
}
api() {
 docker run --rm --name "$container" -v "$PWD:/repo:ro" -v "$workspace:/src" -w /src golang:1.26-bookworm bash -euc '
  source /repo/test/checks.sh
  check "Assertion helper tests" exit "exit 0" bash /repo/test/checks-test.sh
  cp -a /repo/api /src/
  # Go unit tests need an embed input, not a UI build. The full run uses the built UI.
  if [ ! -d /src/api/dist ]; then
   mkdir /src/api/dist
   cp /repo/test/embed.html /src/api/dist/index.html
  fi
  cd /src/api
  check "Go vet" exit "exit 0" go vet ./...
  check "Go race tests" exit "exit 0" go test -race ./...
 '
}
build_image() {
 image_created=true
 check 'Production image build' exit 'exit 0' docker build -t "$image" .
}
curl_stack() {
 "${compose[@]}" run --rm -T --no-deps --entrypoint curl curl --silent --show-error "$@"
}
api_auth() { curl_stack -H "Cookie: tapes=$login_cookie" "$@"; }
wait_ready() {
 local attempt output
 for ((attempt=0; attempt<90; attempt++)); do
  output=$(curl_stack -fsS -u "tapes:$MEDIAMTX_PASS" http://mediamtx:9997/v3/paths/list) || true
  if grep -q '"ready":true' <<<"$output"; then echo true; return; fi
  sleep 1
 done
 echo "${output:-No readiness response}" >&2
 echo false
}
login() {
 curl_stack -D - -o /dev/null -d 'username=test&password=test' http://tapes:8671/login |
  awk 'BEGIN{IGNORECASE=1}/^Set-Cookie: tapes=/{sub("^Set-Cookie: tapes=","");sub(";.*","");print;exit}' | tr -d '\r' >"$scratch/cookie" || return
 cat "$scratch/cookie"
}
wait_recorded() {
 local attempt spans code
 for ((attempt=0; attempt<60; attempt++)); do
  start=$(date -u -d '20 seconds ago' +%Y-%m-%dT%H:%M:%SZ)
  end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  spans=$(api_auth -fsS "http://tapes:8671/cameras/test/recordings?start=$start&end=$end") || return
  if grep -q '"start":' <<<"$spans"; then
   code=$(api_auth -H 'Range: bytes=0-31' -o /dev/null -w '%{http_code}' "http://tapes:8671/cameras/test/playback?start=$start&duration=5") || return
   if [[ "$code" == 206 ]]; then
    # check runs in the parent shell, but captures stdout; persist the selected start.
    echo "$start" >"$scratch/playback-start"
    echo true
    return
   fi
  fi
  sleep 1
 done
 printf 'Last spans: %s; playback status: %s\n' "$spans" "${code:-not requested}" >&2
 echo false
}
stack() {
 stack_started=true
 "${compose[@]}" up -d
 check 'MediaMTX stream ready' equal true wait_ready
 check 'Health' equal 200 curl_stack -o /dev/null -w '%{http_code}' http://tapes:8671/health
 for path in /auth /logout /cameras /cameras/nope /cameras/test/live/index.m3u8 /cameras/test/recordings /cameras/test/playback; do
  method=GET; [[ "$path" == /logout ]] && method=POST
  check "Unauthenticated $method $path" equal 401 curl_stack -X "$method" -o /dev/null -w '%{http_code}' "http://tapes:8671$path"
 done
 check 'Login cookie' nonempty 'nonempty tapes cookie' login
 login_cookie=$(cat "$scratch/cookie")
 check 'Camera name' contains '"name":"test"' api_auth -fsS http://tapes:8671/cameras
 check 'Camera width' contains '"width":640' api_auth -fsS http://tapes:8671/cameras
 check 'Missing camera' equal 404 api_auth -o /dev/null -w '%{http_code}' http://tapes:8671/cameras/nope
 check 'Live HLS playlist' contains '#EXTM3U' api_auth -fsS http://tapes:8671/cameras/test/live/index.m3u8
 check 'Recording spans and playback Range status' equal true wait_recorded
 start=$(cat "$scratch/playback-start")
 check 'Playback Accept-Ranges' icontains '^Accept-Ranges: bytes' api_auth -D - -o /dev/null -H 'Range: bytes=0-31' "http://tapes:8671/cameras/test/playback?start=$start&duration=5"
 check 'Playback HEAD Content-Length' icontains '^Content-Length: [1-9]' api_auth -I "http://tapes:8671/cameras/test/playback?start=$start&duration=5"
 check 'Playback with no recording' equal 404 api_auth -o /dev/null -w '%{http_code}' 'http://tapes:8671/cameras/test/playback?start=2000-01-01T00:00:00Z&duration=5'
 check 'Recording window over seven days' equal 400 api_auth -o /dev/null -w '%{http_code}' 'http://tapes:8671/cameras/test/recordings?start=2000-01-01T00:00:00Z&end=2000-01-09T00:00:00Z'
}
if [[ "$stage" == all || "$stage" == ui || "$stage" == api ]]; then
 run_step setup create_workspace
fi
if [[ "$stage" == all || "$stage" == ui ]]; then run_step UI ui; fi
if [[ "$stage" == all || "$stage" == api ]]; then run_step Go api; fi
if [[ "$stage" == all || "$stage" == stack ]]; then
 run_step image build_image
 run_step stack stack
fi
