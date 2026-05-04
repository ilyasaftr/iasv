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

print_response_debug() {
  local label="$1"
  local headers="$2"
  local body="$3"

  echo "Edge ${label} response did not include a usable operation id." >&2
  echo "Response headers:" >&2
  sed -e 's/[[:cntrl:]]//g' "$headers" >&2 || true
  echo "Response body:" >&2
  sed -e 's/[[:cntrl:]]//g' "$body" >&2 || true
}

extract_operation_id() {
  local label="$1"
  local headers="$2"
  local body="$3"
  local location

  location="$(awk 'BEGIN{IGNORECASE=1} /^Location:/ {print $2}' "$headers" | tr -d '\r')"
  if [ -z "$location" ]; then
    print_response_debug "$label" "$headers" "$body"
    return 1
  fi

  printf '%s\n' "${location##*/}"
}

upload_package() {
  local headers
  headers="$(mktemp)"
  curl -sS -D "$headers" -o /tmp/edge-upload.json \
    -X POST "${API_ROOT}/products/${EDGE_PRODUCT_ID}/submissions/draft/package" \
    "${AUTH_HEADERS[@]}" \
    -H "Content-Type: application/zip" \
    --data-binary "@${ZIP_PATH}"

  extract_operation_id "upload" "$headers" /tmp/edge-upload.json
}

publish_submission() {
  local headers
  headers="$(mktemp)"
  curl -sS -D "$headers" -o /tmp/edge-publish.json \
    -X POST "${API_ROOT}/products/${EDGE_PRODUCT_ID}/submissions" \
    "${AUTH_HEADERS[@]}" \
    -H "Content-Type: text/plain" \
    --data "${EDGE_NOTES:-Automated update}"

  extract_operation_id "publish" "$headers" /tmp/edge-publish.json
}

wait_for_operation() {
  local op_id="$1"
  local kind="${2:-publish}"
  local attempts=${3:-30}
  local sleep_sec=${4:-10}

  if [ -z "$op_id" ]; then
    echo "Missing operation id" >&2
    exit 1
  fi

  local url
  case "$kind" in
    upload)
      url="${API_ROOT}/products/${EDGE_PRODUCT_ID}/submissions/draft/package/operations/${op_id}"
      ;;
    publish)
      url="${API_ROOT}/products/${EDGE_PRODUCT_ID}/submissions/operations/${op_id}"
      ;;
    *)
      echo "Unknown Edge operation kind: ${kind}" >&2
      exit 1
      ;;
  esac

  for i in $(seq 1 "$attempts"); do
    local status http_code
    status="$(mktemp)"
    http_code="$(curl -sS -w '%{http_code}' -o "$status" "${AUTH_HEADERS[@]}" "$url")"

    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
      echo "Edge ${kind} status request failed with HTTP ${http_code}" >&2
      cat "$status" >&2
      exit 1
    fi

    local status_body
    status_body="$(cat "$status")"
    echo "Edge ${kind} operation status (attempt ${i}): ${status_body}"

    if echo "$status_body" | grep -qi "Succeeded"; then
      rm -f "$status"
      return 0
    fi
    if echo "$status_body" | grep -qi "Failed"; then
      echo "Edge ${kind} operation failed" >&2
      exit 1
    fi
    rm -f "$status"
    sleep "$sleep_sec"
  done

  echo "Edge operation did not complete in time" >&2
  exit 1
}

echo "Uploading package to Edge Add-ons..."
UPLOAD_OP="$(upload_package)"
wait_for_operation "$UPLOAD_OP" upload

echo "Publishing submission..."
PUBLISH_OP="$(publish_submission)"
wait_for_operation "$PUBLISH_OP" publish

echo "Edge publish completed."
