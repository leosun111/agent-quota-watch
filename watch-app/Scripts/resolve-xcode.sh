#!/usr/bin/env bash

resolve_xcode_developer_dir() {
  if [[ -n "${DEVELOPER_DIR:-}" && -x "$DEVELOPER_DIR/usr/bin/xcodebuild" ]]; then
    printf '%s\n' "$DEVELOPER_DIR"
    return 0
  fi

  local candidates=(
    "/Applications/Xcode.app/Contents/Developer"
    "$HOME/Applications/Xcode.app/Contents/Developer"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate/usr/bin/xcodebuild" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  while IFS= read -r candidate; do
    if [[ -x "$candidate/usr/bin/xcodebuild" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(
    find "$HOME/Applications" /Applications \
      -maxdepth 2 \
      -path '*/Xcode*.app/Contents/Developer' \
      -type d \
      -print 2>/dev/null | sort -Vr
  )

  return 1
}

export_resolved_xcode_developer_dir() {
  local resolved
  resolved="$(resolve_xcode_developer_dir)" || return 1
  export DEVELOPER_DIR="$resolved"
  printf '%s\n' "$resolved"
}
