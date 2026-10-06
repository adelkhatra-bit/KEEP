#!/bin/bash
# build-submit-ios.sh — Build iOS + TestFlight auto
# Usage: bash scripts/build-submit-ios.sh

set -e

echo "🚀 LOKI MUSIC — iOS BUILD + TESTFLIGHT SUBMISSION"
echo "=================================================="
echo ""
echo "⚠️  Prérequis:"
echo "   • EAS CLI installed (npm install -g eas-cli)"
echo "   • EXPO_TOKEN configured (GitHub Secrets)"
echo "   • Apple Team credentials in EAS (setup 1x)"
echo ""

# Step 1: Build iOS
echo "📱 ÉTAPE 1: Build iOS (45-60 min)"
echo "Commande: cd packages/mobile && eas build --platform ios"
echo ""
echo "Choix:"
echo "  A) Run localement: bash scripts/build-submit-ios.sh local"
echo "  B) Via GitHub Actions: https://github.com/adelkhatra-bit/KEEP/actions"
echo "     → Workflow: auto-eas-build.yml → Run workflow"
echo ""

if [ "$1" = "local" ]; then
    echo "Exécution locale..."
    cd packages/mobile
    echo ""
    echo "🔨 Building iOS..."
    eas build --platform ios --wait
    BUILD_ID=$?
    
    if [ $BUILD_ID -eq 0 ]; then
        echo ""
        echo "✅ Build RÉUSSIE"
        echo "TestFlight: https://testflight.apple.com"
        echo ""
        echo "📝 ÉTAPE 2: Soumettre à App Review"
        echo "1. Attendre l'email Apple TestFlight"
        echo "2. Aller sur: https://appstoreconnect.apple.com/apps/6812393589/appstore"
        echo "3. Section 'Build' → Sélectionner la build"
        echo "4. Cliquer 'Submit for Review'"
        echo "5. Remplir Release Notes (français)"
        echo "6. Cliquer 'Submit'"
        echo ""
        echo "🎯 App Review: 24-48h"
        echo ""
    else
        echo "❌ Build a échoué. Vérifier les logs."
        exit 1
    fi
else
    echo "📊 VIA GITHUB ACTIONS (recommandé):"
    echo "1. Aller sur: https://github.com/adelkhatra-bit/KEEP/actions"
    echo "2. Chercher: 'auto-eas-build' ou 'eas-update-production'"
    echo "3. Cliquer 'Run workflow'"
    echo "4. Branch: reconcile/claude-main-20260825"
    echo "5. Cliquer 'Run workflow'"
    echo ""
    echo "⏳ Attendre ~45 min"
    echo ""
    echo "✅ Quand build est prête:"
    echo "1. TestFlight: https://testflight.apple.com"
    echo "2. App Store Connect: https://appstoreconnect.apple.com/apps/6812393589/appstore"
    echo "3. Cliquer 'Submit for Review'"
    echo ""
fi

