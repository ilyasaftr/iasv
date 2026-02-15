#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-}"
if [ -z "$ZIP_PATH" ]; then
  echo "Usage: $0 <zip-path>" >&2
  exit 1
fi

: "${EDGE_CLIENT_ID:?Missing EDGE_CLIENT_ID}"
: "${EDGE_API_KEY:?Missing EDGE_API_KEY}"
: "${EDGE_PRODUCT_ID:?Missing EDGE_PRODUCT_ID}"

API_ROOT="https://api.addons.microsoftedge.microsoft.com/v1"
AUTH_HEADERS=(
  -H "Authorization: ApiKey ${EDGE_API_KEY}"
  -H "X-ClientID: ${EDGE_CLIENT_ID}"
)

upload_package() {
  local headers
  headers="$(mktemp)"
  curl -sS -D "$headers" -o /tmp/edge-upload.json \
    -X POST "${API_ROOT}/products/${EDGE_PRODUCT_ID}/submissions/draft/package" \
    "${AUTH_HEADERS[@]}" \
    -H "Content-Type: application/zip" \
    --data-binary "@${ZIP_PATH}"

  awk 'BEGIN{IGNORECASE=1} /^Location:/ {print $2}' "$headers" | tr -d '\r'
}

publish_submission() {
  local headers
  headers="$(mktemp)"
  curl -sS -D "$headers" -o /tmp/edge-publish.json \
    -X POST "${API_ROOT}/products/${EDGE_PRODUCT_ID}/submissions" \
    "${AUTH_HEADERS[@]}" \
    -H "Content-Type: text/plain" \
    --data "${EDGE_NOTES:-Automated update}"

  awk 'BEGIN{IGNORECASE=1} /^Location:/ {print $2}' "$headers" | tr -d '\r'
}

wait_for_operation() {
  local op_id="$1"
  local attempts=${2:-30}
  local sleep_sec=${3:-10}

  if [ -z "$op_id" ]; then
    echo "Missing operation id" >&2
    exit 1
  fi

  local op_path="${op_id##*/}"
  local url="${API_ROOT}/products/${EDGE_PRODUCT_ID}/submissions/operations/${op_path}"

  for i in $(seq 1 "$attempts"); do
    local status
    status="$(curl -sS "${AUTH_HEADERS[@]}" "$url")"
    echo "Edge operation status (attempt ${i}): ${status}"

    if echo "$status" | grep -qi "Succeeded"; then
      return 0
    fi
    if echo "$status" | grep -qi "Failed"; then
      echo "Edge operation failed" >&2
      exit 1
    fi
    sleep "$sleep_sec"
  done

  echo "Edge operation did not complete in time" >&2
  exit 1
}

echo "Uploading package to Edge Add-ons..."
UPLOAD_OP="$(upload_package)"
wait_for_operation "$UPLOAD_OP"

echo "Publishing submission..."
PUBLISH_OP="$(publish_submission)"
wait_for_operation "$PUBLISH_OP"

echo "Edge publish completed."
