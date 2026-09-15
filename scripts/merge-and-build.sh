#!/bin/bash
set -e

echo "🔧 KEEP — Merge PR #23 et démarrer build iOS production"
echo "=================================================="

REPO="adelkhatra-bit/KEEP"
PR_NUMBER=23
WORKFLOW="eas-build-ios.yml"
PROFILE="production"

# Vérifier que gh CLI est installé
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) n'est pas installé"
    echo "   Installation: https://cli.github.com"
    exit 1
fi

# Étape 1: Merger le PR
echo "1️⃣  Merger PR #$PR_NUMBER..."
gh pr merge $PR_NUMBER \
    --repo $REPO \
    --merge \
    --auto || {
    echo "⚠️  PR #$PR_NUMBER en attente ou déjà merged"
}

# Attendre que le merge soit complété
echo "⏳ Attente de la propagation du merge..."
sleep 5

# Étape 2: Déclencher le workflow
echo "2️⃣  Lancer le workflow $WORKFLOW avec profil $PROFILE..."
gh workflow run $WORKFLOW \
    --repo $REPO \
    --ref main \
    -F profile=$PROFILE

echo ""
echo "✅ Script complété!"
echo "📋 Statut du workflow: https://github.com/$REPO/actions/workflows/$WORKFLOW"
echo ""
