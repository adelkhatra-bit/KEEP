#!/usr/bin/env bash
# publish-app-store.sh — Loki Music
# Publie la fiche App Store et soumet la v1.0.0 (build 312) SANS clé .p8.
# Auth : Apple ID + mot de passe d'app (Option 1).
#
# Usage :
#   export FASTLANE_USER="ton-apple-id@email.com"
#   export FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#   ./scripts/publish-app-store.sh listing   # remplit la fiche sans soumettre
#   ./scripts/publish-app-store.sh submit    # remplit ET soumet a la review
set -euo pipefail

LANE="${1:-listing}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE/packages/mobile"

: "${APPLE_TEAM_ID:=WTG9399DBK}"
export APPLE_TEAM_ID
export LOKI_APP_IDENTIFIER="${LOKI_APP_IDENTIFIER:-com.adelkhatra.keep}"
export LOKI_BUILD_NUMBER="${LOKI_BUILD_NUMBER:-312}"
export LOKI_APP_VERSION="${LOKI_APP_VERSION:-1.0.0}"

if [ -z "${FASTLANE_USER:-}" ]; then
  echo "❌ FASTLANE_USER manquant (Apple ID). Voir docs/APP_STORE_VOCAL_GUIDE.md" >&2; exit 1
fi
if [ -z "${FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD:-}" ]; then
  echo "❌ FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD manquant (mot de passe d'app)." >&2
  echo "   Genere-le sur https://appleid.apple.com > Connexion & securite > Mots de passe des apps." >&2
  exit 1
fi

if ! command -v fastlane >/dev/null 2>&1; then
  echo "ℹ️  fastlane non installe. Installation : gem install fastlane  (ou: brew install fastlane)" >&2
fi

echo "▶ fastlane ios $LANE  (build $LOKI_BUILD_NUMBER, v$LOKI_APP_VERSION)"
fastlane ios "$LANE"
