#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is dirty. Commit changes before releasing." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' not found. Add origin before releasing." >&2
  exit 1
fi

DATE_STR=$(date +%Y.%-m.%-d)
PREFIX="v${DATE_STR}."

existing=$(git tag -l "${PREFIX}*")
max_n=-1
for tag in $existing; do
  n=${tag#${PREFIX}}
  if [[ "$n" =~ ^[0-9]+$ ]]; then
    if [ "$n" -gt "$max_n" ]; then
      max_n="$n"
    fi
  fi
done

next_n=$((max_n + 1))
new_tag="v${DATE_STR}.${next_n}"

echo "Creating tag ${new_tag}"
git tag "$new_tag"

echo "Pushing tag ${new_tag}"
git push origin "$new_tag"
