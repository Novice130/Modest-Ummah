#!/usr/bin/env bash
set -e

# ==============================================================================
# Modest Ummah iOS App Store Upload Script
# ==============================================================================
# Usage:
#   ./scripts/upload_to_app_store.sh [--skip-build]
# ==============================================================================

KEY_ID="ZA4U66BMCU"
ISSUER_ID="07ba3ed9-33fb-4952-8cb5-aca4d1f5a7d6"
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
