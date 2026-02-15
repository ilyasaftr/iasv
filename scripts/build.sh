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
    VERSION="1970.1.1.0"
    echo "Version tag not found. Defaulting to $VERSION for local build."
  else
    VERSION="${TAG#v}"
  fi
fi

if ! [[ "$VERSION" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\.[0-9]+$ ]]; then
  echo "Invalid version: $VERSION" >&2
  echo "Use CalVer format YYYY.M.D.N (e.g. 2026.2.15.1)." >&2
  exit 1
fi

YEAR="${VERSION%%.*}"
REST="${VERSION#*.}"
MONTH="${REST%%.*}"
REST="${REST#*.}"
DAY="${REST%%.*}"

if ! [[ "$MONTH" =~ ^([1-9]|1[0-2])$ ]]; then
  echo "Invalid month in version: $MONTH" >&2
  exit 1
fi

if ! [[ "$DAY" =~ ^([1-9]|[12][0-9]|3[01])$ ]]; then
  echo "Invalid day in version: $DAY" >&2
  exit 1
fi

echo "Building version $VERSION"

rm -rf dist
mkdir -p dist/build/mv3 dist/build/mv2

# Assemble MV3 build in dist
cp -R extension/mv3/* dist/build/mv3/
rm -rf dist/build/mv3/shared dist/build/mv3/_locales
cp -R extension/shared dist/build/mv3/
cp -R extension/_locales dist/build/mv3/

# Assemble MV2 build in dist
cp -R extension/mv2/* dist/build/mv2/
rm -rf dist/build/mv2/shared dist/build/mv2/_locales
cp -R extension/shared dist/build/mv2/
cp -R extension/_locales dist/build/mv2/

perl -0pi -e 's/"version"\s*:\s*"[^"]*"/"version": "'"$VERSION"'"/g' \
  dist/build/mv3/manifest.json \
  dist/build/mv2/manifest.json

(
  cd dist/build/mv3
  zip -r "$ROOT_DIR/dist/ig-story-anonymous-mv3.zip" .
)

(
  cd dist/build/mv2
  zip -r "$ROOT_DIR/dist/ig-story-anonymous-mv2.zip" .
)

echo "Artifacts written to dist/"
