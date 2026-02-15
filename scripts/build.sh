#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${VERSION:-}"
if [ -z "$VERSION" ]; then
  TAG="${GITHUB_REF_NAME:-}"
  if [ -z "$TAG" ]; then
    TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  fi
  if [ -z "$TAG" ]; then
    VERSION="1970.01.01.0"
    echo "Version tag not found. Defaulting to $VERSION for local build."
  else
    VERSION="${TAG#v}"
  fi
fi

if ! [[ "$VERSION" =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$ ]]; then
  echo "Invalid version: $VERSION" >&2
  echo "Use CalVer format YYYY.MM.DD.N (e.g. 2026.02.15.1)." >&2
  exit 1
fi

YEAR="${VERSION%%.*}"
REST="${VERSION#*.}"
MONTH="${REST%%.*}"
REST="${REST#*.}"
DAY="${REST%%.*}"

if ! [[ "$MONTH" =~ ^(0[1-9]|1[0-2])$ ]]; then
  echo "Invalid month in version: $MONTH" >&2
  exit 1
fi

if ! [[ "$DAY" =~ ^(0[1-9]|[12][0-9]|3[01])$ ]]; then
  echo "Invalid day in version: $DAY" >&2
  exit 1
fi

echo "Building version $VERSION"

rm -rf dist
mkdir -p dist

rm -rf extension/mv3/shared extension/mv2/shared
rm -rf extension/mv3/_locales extension/mv2/_locales
cp -R extension/shared extension/mv3/
cp -R extension/shared extension/mv2/
cp -R extension/_locales extension/mv3/
cp -R extension/_locales extension/mv2/

perl -0pi -e 's/"version"\s*:\s*"[^"]*"/"version": "'"$VERSION"'"/g' \
  extension/mv3/manifest.json \
  extension/mv2/manifest.json

(
  cd extension/mv3
  zip -r "$ROOT_DIR/dist/ig-story-anonymous-mv3.zip" .
)

(
  cd extension/mv2
  zip -r "$ROOT_DIR/dist/ig-story-anonymous-mv2.zip" .
)

echo "Artifacts written to dist/"
