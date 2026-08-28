#!/usr/bin/env bash
set -euo pipefail

VAULT="${VAULT_PATH:-./data/vault}"
WA_DIR="$VAULT/WhatsApp"
MEDIA_DIR="$VAULT/media"
DRY_RUN="${1:-}"

if [[ ! -d "$MEDIA_DIR" ]]; then
  echo "[cleanup] no media folder, nothing to do"
  exit 0
fi

if [[ ! -d "$WA_DIR" ]]; then
  echo "[cleanup] no WhatsApp notes folder at $WA_DIR — aborting for safety"
  exit 1
fi

# Collect referenced filenames from all markdown notes
# Matches: ![[media/filename.ext]] and [[media/filename.ext]]
REFS=$(mktemp)
trap 'rm -f "$REFS"' EXIT

find "$WA_DIR" -type f -name '*.md' -print0 2>/dev/null \
  | xargs -0 grep -ohE '\[\[media/[^]]+\]\]' 2>/dev/null \
  | sed -E 's/^\[\[media\///; s/\]\].*$//; s/\|.*//; s/#.*//' \
  | sort -u > "$REFS" || true

ref_count=$(wc -l < "$REFS" | tr -d ' ')
echo "[cleanup] found $ref_count unique media reference(s) in notes"

# Safety: if notes exist but we found zero refs, something is wrong — don't delete
md_count=$(find "$WA_DIR" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$md_count" -gt 0 && "$ref_count" -eq 0 ]]; then
  echo "[cleanup] SAFETY STOP: $md_count note(s) exist but 0 media refs matched."
  echo "[cleanup] Refusing to delete anything. Check the script / note format."
  exit 1
fi

deleted=0
kept=0

for f in "$MEDIA_DIR"/*; do
  [[ -e "$f" ]] || continue
  [[ -f "$f" ]] || continue

  name=$(basename "$f")

  if grep -qxF "$name" "$REFS"; then
    kept=$((kept + 1))
  else
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
      echo "[cleanup] WOULD delete: media/$name"
    else
      rm -f "$f"
      echo "[cleanup] deleted: media/$name"
    fi
    deleted=$((deleted + 1))
  fi
done

echo "[cleanup] done — kept $kept, deleted $deleted"
