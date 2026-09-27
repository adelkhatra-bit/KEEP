const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'ai-ops-digest');
fs.mkdirSync(outDir, { recursive: true });

const repo = process.env.GITHUB_REPOSITORY || 'adelkhatra-bit/KEEP';
const [owner, name] = repo.split('/');
const branch = process.env.KEEP_SOURCE_BRANCH || 'reconcile/claude-main-20260825';
const token = process.env.GITHUB_TOKEN || '';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const strictMode = process.env.KEEP_AI_DIGEST_STRICT === '1';
const headers = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'keep-ai-ops-digest',
};
if (token) headers.Authorization = 'Bearer ' + token;

async function request(endpoint) {
  const response = await fetch(`${apiBase}${endpoint}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${endpoint} -> ${response.status} ${text.slice(0, 300)}`);
  }
  return response.json();
}

async function safeRequest(endpoint, fallback, warnings) {
  try {
    return await request(endpoint);
  } catch (error) {
    const message = `${endpoint} -> ${error.message}`;
    if (strictMode) throw error;
    warnings.push(message);
    return fallback;
  }
}

function issueToLine(issue) {
  return `- #${issue.number} — ${issue.title} (${issue.html_url})`;
}

function runToLine(run) {
  return `- ${run.name} — ${run.conclusion || run.status} (${run.html_url})`;
}

function prToLine(pr) {
  return `- #${pr.number} — ${pr.title} (${pr.html_url})`;
}

async function main() {
  const warnings = [];
  const [runs, prs, agentIssues, bugIssues] = await Promise.all([
    safeRequest(`/repos/${owner}/${name}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=20`, { workflow_runs: [] }, warnings),
    safeRequest(`/repos/${owner}/${name}/pulls?state=open&base=${encodeURIComponent(branch)}&per_page=10`, [], warnings),
    safeRequest(`/repos/${owner}/${name}/issues?state=open&labels=${encodeURIComponent('agent-task')}&per_page=10`, [], warnings),
    safeRequest(`/repos/${owner}/${name}/issues?state=open&labels=${encodeURIComponent('bug')}&per_page=10`, [], warnings),
  ]);

  const workflowRuns = Array.isArray(runs.workflow_runs) ? runs.workflow_runs : [];
  const recentFailures = workflowRuns.filter((run) => ['failure', 'cancelled', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion)).slice(0, 5);
  const openPrs = Array.isArray(prs) ? prs.slice(0, 5) : [];
  const openAgentIssues = (Array.isArray(agentIssues) ? agentIssues : []).filter((issue) => !issue.pull_request).slice(0, 5);
  const openBugIssues = (Array.isArray(bugIssues) ? bugIssues : []).filter((issue) => !issue.pull_request).slice(0, 5);

  let freeToolingCoverage = null;
  const freeToolingPath = path.join(root, 'artifacts', 'free-tooling-audit', 'report.json');
  if (fs.existsSync(freeToolingPath)) {
    freeToolingCoverage = JSON.parse(fs.readFileSync(freeToolingPath, 'utf8'));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    repository: repo,
    branch,
    workflowRunCount: workflowRuns.length,
    failedWorkflowCount: recentFailures.length,
    openPullRequestCount: Array.isArray(prs) ? prs.length : 0,
    openAgentIssueCount: (Array.isArray(agentIssues) ? agentIssues : []).filter((issue) => !issue.pull_request).length,
    openBugIssueCount: (Array.isArray(bugIssues) ? bugIssues : []).filter((issue) => !issue.pull_request).length,
    freeToolingCoverage,
    warnings,
    recentFailures: recentFailures.map((run) => ({ name: run.name, conclusion: run.conclusion, html_url: run.html_url })),
    openPullRequests: openPrs.map((pr) => ({ number: pr.number, title: pr.title, html_url: pr.html_url })),
    openAgentIssues: openAgentIssues.map((issue) => ({ number: issue.number, title: issue.title, html_url: issue.html_url })),
    openBugIssues: openBugIssues.map((issue) => ({ number: issue.number, title: issue.title, html_url: issue.html_url })),
  };

  const lines = [
    '# Digest Ops / IA KEEP',
    '',
    `- Dépôt : \`${repo}\``,
    `- Branche source : \`${branch}\``,
    `- Généré le : \`${report.generatedAt}\``,
    `- Workflows récents inspectés : **${report.workflowRunCount}**`,
    `- Workflows rouges récents : **${report.failedWorkflowCount}**`,
    `- PR ouvertes sur la branche source : **${report.openPullRequestCount}**`,
    `- Issues agents ouvertes : **${report.openAgentIssueCount}**`,
    `- Bugs ouverts : **${report.openBugIssueCount}**`,
  ];

  if (freeToolingCoverage) {
    lines.push(`- Couverture free tooling : **${freeToolingCoverage.coverage}%** (${freeToolingCoverage.passedCount}/${freeToolingCoverage.totalCount})`);
  }

  if (warnings.length) {
    lines.push(`- Avertissements sources GitHub : **${warnings.length}**`);
  }

  lines.push('', '## Workflows rouges récents', '');
  if (recentFailures.length) lines.push(...recentFailures.map(runToLine));
  else lines.push('- Aucun workflow rouge récent dans la fenêtre inspectée.');

  lines.push('', '## PR ouvertes', '');
  if (openPrs.length) lines.push(...openPrs.map(prToLine));
  else lines.push('- Aucune PR ouverte sur la branche source.');

  lines.push('', '## Issues agents ouvertes', '');
  if (openAgentIssues.length) lines.push(...openAgentIssues.map(issueToLine));
  else lines.push('- Aucune issue agent ouverte.');

  lines.push('', '## Bugs ouverts', '');
  if (openBugIssues.length) lines.push(...openBugIssues.map(issueToLine));
  else lines.push('- Aucun bug ouvert.');

  lines.push('', '## Usage par les IA', '', '- Relire ce digest avant une tâche d’ops/CI importante.', '- Croiser avec `PROJECT_STATE.md`, `.context/activeContext.md`, `AGENT_MESSAGES.md` et `docs/ops/GITHUB_AI_COMMAND_CENTER.md`.', '- Si un workflow rouge est causé par un changement réel, consigner la cause racine dans `docs/ERROR_LEDGER.md`.');

  if (warnings.length) {
    lines.push('', '## Avertissements', '', ...warnings.map((warning) => `- ${warning}`));
  }

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), `${lines.join('\n')}\n`);

  console.log(`AI OPS DIGEST: failures=${report.failedWorkflowCount} prs=${report.openPullRequestCount} agentIssues=${report.openAgentIssueCount} bugs=${report.openBugIssueCount} warnings=${warnings.length}`);
}

main().catch((error) => {
  console.error(`AI OPS DIGEST FAILED: ${error.message}`);
  process.exit(1);
});
