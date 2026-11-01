#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/checks.sh"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

check 'Exit success' exit 'exit 0' true
check 'Equal success' equal 200 printf 200
check 'Case insensitive pattern' icontains '^accept-ranges: bytes' printf 'Accept-Ranges: bytes\r\n'
check 'Nonempty success' nonempty nonempty printf cookie

expect_failure() {
 local name=$1 mode=$2 expected=$3
 shift 3
 local status=0
 # Use a new shell with errexit, just as the runner does, to catch premature exits.
 bash -euc 'source "$1"; shift; check "$@"' bash "$(dirname "$0")/checks.sh" "$name" "$mode" "$expected" "$@" >"$scratch/output" 2>&1 || status=$?
 test "$status" = 1
 grep -q "^FAIL: $name$" "$scratch/output"
 grep -q '^Expected: ' "$scratch/output"
 grep -q '^Actual: ' "$scratch/output"
 grep -q '^Output (last 40 lines):$' "$scratch/output"
}
expect_failure 'Wrong value' equal 200 printf 500
grep -q '^Actual: 500 (exit 0)$' "$scratch/output"
expect_failure 'Missing pattern' contains present printf absent
expect_failure 'Case sensitive pattern' contains present printf PRESENT
expect_failure 'Empty output' nonempty nonempty true
expect_failure 'Command failure' exit 'exit 0' bash -c 'echo problem >&2; exit 7'
grep -q '^Actual: exit 7$' "$scratch/output"
grep -q '^problem$' "$scratch/output"
expect_failure 'Bounded output' exit 'exit 0' bash -c 'seq 1 100; exit 1'
test "$(wc -l <"$scratch/output")" = 44
test "$(tail -n 1 "$scratch/output")" = 100
