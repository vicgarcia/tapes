#!/usr/bin/env bash
# Shared by the host runner and the UI/API containers.
check() {
 local name=$1 mode=$2 expected=$3 actual status=0
 shift 3
 local output errors
 output=$(mktemp); errors=$(mktemp)
 "$@" >"$output" 2>"$errors" || status=$?
 actual=$(cat "$output")
 local passed=false
 if (( status == 0 )); then
  case "$mode" in
   exit) passed=true; actual="exit $status" ;;
   equal) [[ "$actual" == "$expected" ]] && passed=true ;;
   contains) grep -Eq -- "$expected" "$output" && passed=true ;;
   icontains) grep -Eqi -- "$expected" "$output" && passed=true ;;
   nonempty) [[ -n "$actual" ]] && passed=true ;;
  esac
 fi
 if [[ "$passed" != true ]]; then
  case "$mode" in
   exit) actual="exit $status" ;;
   equal) actual="${actual//$'\n'/\\n}"; actual="${actual:0:200} (exit $status)" ;;
   contains|icontains) actual="pattern not found (exit $status)" ;;
   nonempty) actual="${actual:+nonempty output}"; actual="${actual:-<empty>} (exit $status)" ;;
  esac
  printf 'FAIL: %s\nExpected: %s\nActual: %s\nOutput (last 40 lines):\n' "$name" "$expected" "${actual:-<empty>}" >&2
  awk '1' "$output" "$errors" | tail -n 40 >&2
  rm -f "$output" "$errors"
  return 1
 fi
 printf 'PASS: %s\n' "$name"
 rm -f "$output" "$errors"
}
