#!/bin/bash
# Lance le build EAS localement (sans dépendre de GitHub Secrets)
# Utilise : bash BUILD_EAS_LOCAL.sh

set -e

echo "=== KEEP — Build iOS EAS (local) ==="
echo ""

cd packages/mobile

# Vérifier que les secrets locaux existent
if [ -z "$EXPO_TOKEN" ]; then
  echo "❌ EXPO_TOKEN non défini"
  echo "   Ajoute : export EXPO_TOKEN=eyJ... (depuis https://expo.dev)"
  exit 1
fi

echo "✅ EXPO_TOKEN détecté"
echo ""
echo "Lancement du build EAS production..."
echo "Profile : production"
echo "Platform : iOS"
echo ""

# Lancer le build
npm run prebuild || true

# Build EAS production
eas build --platform ios --profile production --non-interactive

echo ""
echo "=== Build lancé ! ==="
echo "Monitore : https://expo.dev/builds"
echo ""
echo "Après le build :"
echo "- Si tout est OK → TestFlight submit manuel"
echo "- Ou configure les secrets GitHub pour auto-submit"
