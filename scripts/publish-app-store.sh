#!/usr/bin/env bash
# publish-app-store.sh — Loki Music
# Publie la fiche App Store et soumet la v1.0.0 (build 312) de facon AUTONOME.
#
# Auth prioritaire (100% autonome, sans mot de passe d'app) : cle API App Store
# Connect — le meme secret qui a deja produit le build 312 :
#   ASC_API_KEY_P8_BASE64 + ASC_KEY_ID + ASC_ISSUER_ID
#
# Repli (si seule une auth Apple ID est disponible) :
#   FASTLANE_USER + FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD
#
# Usage :
#   # Option A (recommandee, autonome) :
#   export ASC_API_KEY_P8_BASE64="$(base64 -w0 AuthKey_XXXX.p8)"
#   export ASC_KEY_ID="XXXXXXXXXX"
#   export ASC_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#   ./scripts/publish-app-store.sh listing   # remplit la fiche sans soumettre
#   ./scripts/publish-app-store.sh submit     # remplit ET soumet a la review
#
#   # Option B (repli) :
#   export FASTLANE_USER="ton-apple-id@email.com"
#   export FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#   ./scripts/publish-app-store.sh submit
set -euo pipefail

LANE="${1:-listing}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE/packages/mobile"

: "${APPLE_TEAM_ID:=WTG9399DBK}"
export APPLE_TEAM_ID
export LOKI_APP_IDENTIFIER="${LOKI_APP_IDENTIFIER:-com.adelkhatra.keep}"
export LOKI_BUILD_NUMBER="${LOKI_BUILD_NUMBER:-312}"
export LOKI_APP_VERSION="${LOKI_APP_VERSION:-1.0.0}"

has_api_key=false
if [ -n "${ASC_API_KEY_P8_BASE64:-}" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  has_api_key=true
fi

has_apple_id=false
if [ -n "${FASTLANE_USER:-}" ] && [ -n "${FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD:-}" ]; then
  has_apple_id=true
fi

if [ "$has_api_key" = false ] && [ "$has_apple_id" = false ]; then
  echo "❌ Auth Apple absente." >&2
  echo "   Option A (autonome) : ASC_API_KEY_P8_BASE64 + ASC_KEY_ID + ASC_ISSUER_ID" >&2
  echo "   Option B (repli)    : FASTLANE_USER + FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD" >&2
  echo "   Voir docs/APP_STORE_VOCAL_GUIDE.md" >&2
  exit 1
fi

if [ "$has_api_key" = true ]; then
  echo "🔑 Auth : cle API App Store Connect (mode 100% autonome)."
else
  echo "🔑 Auth : Apple ID + mot de passe d'app (repli)."
fi

if ! command -v fastlane >/dev/null 2>&1; then
  echo "ℹ️  fastlane non installe. Installation : gem install fastlane  (ou: brew install fastlane)" >&2
fi

echo "▶ fastlane ios $LANE  (build $LOKI_BUILD_NUMBER, v$LOKI_APP_VERSION)"
fastlane ios "$LANE"
