#!/usr/bin/env bash
set -euo pipefail

cameras_dir=${1:-./data/cameras}
moved=0
thumbnails_removed=0
skipped=0

shopt -s nullglob
for camera_dir in "$cameras_dir"/*; do
  [[ -d "$camera_dir" ]] || continue
  for file in "$camera_dir"/*; do
    [[ -f "$file" ]] || continue
    name=${file##*/}
    if [[ $name =~ ^[0-9]{14}-[0-9]{6}(Z|[+-][0-9]{4})\.mp4$ ]]; then
      continue
    fi
    if [[ ! $name =~ ^([0-9]{14})\.mp4$ ]]; then
      echo "Skipping unknown file: $file" >&2
      ((skipped+=1))
      continue
    fi
    timestamp=${BASH_REMATCH[1]}
    if ! date -d "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:8:2}:${timestamp:10:2}:${timestamp:12:2}" >/dev/null 2>&1; then
      echo "Skipping unknown file: $file" >&2
      ((skipped+=1))
      continue
    fi
    offset=$(TZ="${TZ:-UTC}" date -d "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:8:2}:${timestamp:10:2}:${timestamp:12:2}" +%z)
    target="$camera_dir/${timestamp}-000000${offset}.mp4"
    if [[ -e $target ]]; then
      echo "Skipping existing target: $target" >&2
      ((skipped+=1))
      continue
    fi
    thumbnail="${file%.mp4}.jpg"
    if [[ ${DRY_RUN:-0} == 1 ]]; then
      echo "Would move: $file -> $target"
      [[ ! -e $thumbnail ]] || echo "Would remove thumbnail: $thumbnail"
      continue
    fi
    mv -- "$file" "$target"
    ((moved+=1))
    if [[ -e $thumbnail ]]; then
      rm -- "$thumbnail"
      ((thumbnails_removed+=1))
    fi
  done
done
printf 'Files moved: %d\nThumbnails removed: %d\nFiles skipped: %d\n' "$moved" "$thumbnails_removed" "$skipped"
