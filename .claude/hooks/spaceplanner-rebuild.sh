#!/usr/bin/env bash
# PostToolUse (Edit|Write): auto-rebuild SpacePlanner's bundle.js after any
# edit under SpacePlanner/js/. Replaces the old prose rule ("you MUST rebuild").
# Build failure exits 2 so the esbuild errors are fed back to Claude.
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")' 2>/dev/null)

case "$file" in
  */SpacePlanner/js/*.js) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR/SpacePlanner" || exit 0
out=$(npx --yes esbuild js/app.js --bundle --outfile=bundle.js --format=iife 2>&1)
if [ $? -ne 0 ]; then
  echo "SpacePlanner auto-rebuild FAILED — bundle.js is stale until this compiles:" >&2
  echo "$out" | tail -20 >&2
  exit 2
fi
exit 0
