# Audit exploitation GitHub + modules gratuits

- Branche source produit : `reconcile/claude-main-20260825`
- Cible de couverture : **100%**
- Couverture observée : **100%** (15/15)

## Résultats

### ✅ GitHub Actions CI multi-workflow
- id : `github-actions-ci`
- catégorie : `github`
- OK — `.github/workflows/full-stack-ci.yml` → name: KEEP — CI complète ; workflow_dispatch:
- OK — `.github/workflows/mobile-ci.yml` → workflow_dispatch:

### ✅ GitHub Pages deployment chain
- id : `github-pages-deploy`
- catégorie : `github`
- OK — `.github/workflows/web-preview-pages.yml` → actions/deploy-pages ; workflow_dispatch:

### ✅ CodeQL security scanning
- id : `codeql-security`
- catégorie : `github`
- OK — `.github/workflows/codeql.yml` → github/codeql-action/init ; schedule:

### ✅ Dependabot npm + GitHub Actions
- id : `dependabot-updates`
- catégorie : `github`
- OK — `.github/dependabot.yml` → package-ecosystem: npm ; package-ecosystem: github-actions

### ✅ GitHub artifacts for audit evidence
- id : `artifacts-evidence`
- catégorie : `github`
- OK — `.github/workflows/keep-dual-viewport-guardian.yml` → actions/upload-artifact
- OK — `.github/workflows/app-store-native-preflight.yml` → actions/upload-artifact

### ✅ GitHub templates + CODEOWNERS
- id : `issues-pr-governance`
- catégorie : `github`
- OK — `.github/ISSUE_TEMPLATE/agent_task.md` → labels: agent-task
- OK — `.github/ISSUE_TEMPLATE/design_review.yml` → name: Revue design IA ; scope:product
- OK — `.github/ISSUE_TEMPLATE/incident_report.yml` → name: Incident production ; [incident]
- OK — `.github/ISSUE_TEMPLATE/config.yml` → Centre de commandement GitHub IA KEEP ; Relais IA ChatGPT ↔ Claude Code
- OK — `.github/pull_request_template.md` → KEEP — contrôle anti-régression
- OK — `.github/CODEOWNERS` → /.github/ @adelkhatra-bit

### ✅ AI relay between ChatGPT and Claude
- id : `ai-relay`
- catégorie : `automation`
- OK — `AI/AI_bridge.md` → keep-ai-relay ; GET /keep-ai-relay?op=state
- OK — `.github/workflows/deploy-keep-ai-relay.yml` → functions deploy keep-ai-relay ; workflow_dispatch:

### ✅ GitHub-native AI command center
- id : `agent-command-center`
- catégorie : `automation`
- OK — `docs/ops/GITHUB_AI_COMMAND_CENTER.md` → poste de commandement GitHub-native ; agent-command-triage.yml
- OK — `.github/workflows/agent-command-triage.yml` → issues: ; workflow_dispatch:

### ✅ workflow_dispatch + schedule for unattended audits
- id : `manual-and-scheduled-triggers`
- catégorie : `github`
- OK — `.github/workflows/keep-human-guardian.yml` → workflow_dispatch: ; schedule:
- OK — `.github/workflows/codeql.yml` → schedule:

### ✅ Free macOS local iOS build on public GitHub runners
- id : `free-macos-ios-build`
- catégorie : `delivery`
- OK — `.github/workflows/auto-eas-build.yml` → runs-on: macos-latest ; eas build --local
- OK — `AI/AI_bridge.md` → macos-latest ; eas build --local

### ✅ Workflow linting with actionlint
- id : `workflow-lint-actionlint`
- catégorie : `github`
- OK — `.github/workflows/actionlint.yml` → KEEP — Actionlint ; actionlint -color

### ✅ OpenSSF Scorecards security posture
- id : `ossf-scorecards`
- catégorie : `security`
- OK — `.github/workflows/scorecards.yml` → KEEP — OpenSSF Scorecards ; ossf/scorecard-action

### ✅ Automated draft release notes
- id : `release-drafter`
- catégorie : `github`
- OK — `.github/workflows/release-drafter.yml` → KEEP — Release Drafter ; release-drafter/release-drafter
- OK — `.github/release-drafter.yml` → ## Coordination IA ; docs/ops/GITHUB_AI_COMMAND_CENTER.md

### ✅ Scheduled AI ops digest for anticipation
- id : `ai-ops-digest`
- catégorie : `automation`
- OK — `.github/workflows/ai-ops-digest.yml` → KEEP — AI ops digest ; Build AI ops digest
- OK — `scripts/build-ai-ops-digest.cjs` → Digest Ops / IA KEEP ; AI OPS DIGEST:

### ✅ Careful stale hygiene for scalable triage
- id : `stale-hygiene`
- catégorie : `automation`
- OK — `.github/workflows/stale-hygiene.yml` → KEEP — Stale hygiene ; actions/stale@

