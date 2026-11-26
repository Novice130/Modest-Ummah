#!/usr/bin/env bash
set -e

# ==============================================================================
# Modest Ummah iOS App Store Upload Script
# ==============================================================================
# Usage:
#   ./scripts/upload_to_app_store.sh [--skip-build]
# ==============================================================================

# App Store Connect API key, from the environment:
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (path to AuthKey_<id>.p8)
for var in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do
  if [ -z "${!var}" ]; then
    echo "❌ Error: environment variable $var is not set (need ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH)." >&2
    exit 1
  fi
done
KEY_ID="$ASC_KEY_ID"
ISSUER_ID="$ASC_ISSUER_ID"
# altool looks for AuthKey_<id>.p8 in API_PRIVATE_KEYS_DIR among other places.
export API_PRIVATE_KEYS_DIR="$(dirname "$ASC_KEY_PATH")"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IPA_PATH="$PROJECT_ROOT/build/ios/ipa/modest_ummah.ipa"

if [ ! -f "$IPA_PATH" ]; then
  echo "❌ Error: IPA not found at $IPA_PATH"
  echo "Please build the IPA first or run the export command."
  exit 1
fi

echo "📦 Found App Store IPA: $IPA_PATH ($(du -h "$IPA_PATH" | cut -f1))"

echo "🔍 Validating IPA with App Store Connect..."
xcrun altool --validate-app \
  -f "$IPA_PATH" \
  -t ios \
  --apiKey "$KEY_ID" \
  --apiIssuer "$ISSUER_ID"

echo "🚀 Uploading IPA to App Store Connect / TestFlight..."
xcrun altool --upload-app \
  -f "$IPA_PATH" \
  -t ios \
  --apiKey "$KEY_ID" \
  --apiIssuer "$ISSUER_ID"

echo "🎉 Successfully uploaded build to App Store Connect / TestFlight!"
