#!/usr/bin/env bash
set -euo pipefail

VAULT="${VAULT_PATH:-./data/vault}"
WA_DIR="$VAULT/WhatsApp"
MEDIA_DIR="$VAULT/media"

if [[ ! -d "$MEDIA_DIR" ]]; then
  echo "[cleanup] no media folder, nothing to do"
  exit 0
fi

# Collect all media references from markdown files
REFS=$(mktemp)
find "$WA_DIR" -type f -name '*.md' -print0 2>/dev/null \
  | xargs -0 grep -ohE '!\[\[media/[^\]|#]+|\[\[media/[^\]|#]+' 2>/dev/null \
  | sed -E 's/^!\[\[//; s/^\[\[//; s/\|.*//; s/#.*//' \
  | sort -u > "$REFS" || true

deleted=0
kept=0

for f in "$MEDIA_DIR"/*; do
  [[ -f "$f" ]] || continue
  name=$(basename "$f")
  rel="media/$name"

  if grep -qxF "$rel" "$REFS"; then
    kept=$((kept + 1))
  else
    rm -f "$f"
    echo "[cleanup] deleted orphan: $rel"
    deleted=$((deleted + 1))
  fi
done

rm -f "$REFS"
echo "[cleanup] done — kept $kept, deleted $deleted"
