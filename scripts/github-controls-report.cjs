#!/usr/bin/env node
'use strict';

// Backend/CLI only. No client token, writes to GitHub, artifacts or log downloads.
const contract = require('../BRANCH_SOURCE_OF_TRUTH.json');
const product = require('../config/keep-product-contract.json');
const REPOSITORY = 'adelkhatra-bit/KEEP';
const BRANCH = 'reconcile/claude-main-20260825';
const CONTROLS = [
  'full-stack-ci.yml', 'mobile-ci.yml', 'codeql.yml',
  'product-contract-guard.yml', 'data-preservation.yml',
  'verify-migrations.yml', 'keep-dual-viewport-guardian.yml',
  'keep-journeys.yml', 'keep-ui-baseline-guard.yml',
  'design-interaction-guardian.yml', 'loki-security-guard.yml',
];
const LIMITS = Object.freeze({ days: 7, perPage: 100, maxPages: 3, timeoutMs: 15000 });
const CONTROL_LABELS = [
  'CI complète', 'CI mobile', 'Analyse CodeQL', 'Contrat produit',
  'Préservation des données', 'Migrations', 'Parité mobile / ordinateur',
  'Parcours utilisateur', 'Référence visuelle', 'Interactions et design', 'Sécurité Loki Music',
];
const CATEGORY_LABELS = {
  success: 'réussi', skipped: 'ignoré (skipped)', failure: 'échec',
  pending: 'en attente / en cours', cancelled: 'annulé', neutral: 'neutre', unknown: 'inconnu',
};

// Encode punctuation rather than trusting Markdown/HTML from remote metadata.
function summaryText(value) {
  return String(value ?? 'indisponible')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, char => `&#${char.codePointAt(0)};`);
}

function summaryDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) ? summaryText(value) : 'indisponible';
}

function renderSummary(report) {
  // Fail closed: no private/unknown metadata, issue text, job names, logs or tokens.
  if (report.visibility !== 'public') return null;
  const exitCode = reportExitCode(report);
  const verdict = exitCode === 1 ? 'ÉCHEC OBSERVÉ' :
    exitCode === 2 ? 'INCOMPLET — aucune validation globale' : 'CONTRÔLES LISTÉS RÉUSSIS — observation uniquement';
  const lines = [
    '## Loki Music — synthèse des contrôles GitHub',
    '',
    `**Verdict : ${verdict}.**`,
    'Un contrôle ou un job ignoré (skipped), annulé, neutre, en attente ou inconnu ne vaut jamais une réussite.',
    `Collecte : ${summaryDate(report.generatedAt)} (UTC).`,
    `Version observée (SHA) : ${/^[a-f0-9]{40}$/.test(report.sha) ? summaryText(report.sha) : 'indisponible'}.`,
    `Date du commit : ${summaryDate(report.commitDate)} (UTC).`,
    `Couverture de la collecte : ${report.complete ? 'complète dans les limites annoncées' : 'incomplète (données absentes, limites de pagination ou HEAD non confirmé)'}.`,
    '',
    '| Contrôle | Statut observé | Jobs observés | SHA du run | Date du run (UTC) | Lien |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const [index, workflow] of CONTROLS.entries()) {
    const control = report.controls.find(c => c.workflow === workflow);
    const run = control?.run;
    const jobCounts = control?.jobCounts || {};
    const jobs = Object.entries(CATEGORY_LABELS).map(([category, label]) => {
      const count = jobCounts[category];
      return `${Number.isSafeInteger(count) && count >= 0 ? count : '?'} ${label}`;
    }).join(' ; ');
    // Only a canonical numeric run URL is clickable; no query/fragment/credentials.
    const url = run && Number.isSafeInteger(run.id) && run.id > 0 &&
      run.url === `https://github.com/${REPOSITORY}/actions/runs/${run.id}` ? run.url : null;
    lines.push(`| ${summaryText(CONTROL_LABELS[index])} | ${summaryText(CATEGORY_LABELS[control?.category] || CATEGORY_LABELS.unknown)} | ${summaryText(jobs)}${control?.jobsComplete ? '' : ' ; collecte incomplète'} | ${run && /^[a-f0-9]{40}$/.test(run.sha) ? summaryText(run.sha) : 'indisponible'} | ${summaryDate(run?.createdAt)} | ${url ? `[Voir le contrôle](${url})` : 'indisponible'} |`);
  }
  lines.push('', 'Périmètre : dernière tentative de chacun des 11 contrôles listés, pour le HEAD de reconcile/claude-main-20260825, sur 7 jours ; au plus 3 pages de 100 résultats par collecte.',
    'Les compteurs portent seulement sur les jobs observés : zéro avec une collecte incomplète ne signifie pas absence de jobs.',
    'Hors périmètre : autres workflows, déploiements, contrôles externes, artefacts, logs et signalements privés. Cette synthèse ne prouve ni une livraison ni le bon fonctionnement global de l’application.', '');
  return `${lines.join('\n')}\n`;
}

function writeSummary(report, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (report.visibility !== 'public' || !summaryPath) return false;
  require('node:fs').appendFileSync(summaryPath, renderSummary(report), 'utf8');
  return true;
}

function classify(status, conclusion) {
  if (status !== 'completed') return ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(status) ? 'pending' : 'unknown';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'skipped') return 'skipped';
  if (['failure', 'timed_out', 'action_required', 'startup_failure', 'stale'].includes(conclusion)) return 'failure';
  if (conclusion === 'cancelled') return 'cancelled';
  if (conclusion === 'neutral') return 'neutral';
  return 'unknown';
}

function link(value) {
  return typeof value === 'string' && value.startsWith(`https://github.com/${REPOSITORY}/`) ? value : null;
}

function counts(items) {
  const result = { success: 0, skipped: 0, failure: 0, pending: 0, cancelled: 0, neutral: 0, unknown: 0 };
  for (const item of items) result[item.category]++;
  return result;
}

function reportExitCode(report) {
  if (report.controls.some(c => c.category === 'failure' || c.jobCounts.failure > 0)) return 1;
  if (!report.complete || report.controls.some(c => c.category !== 'success' ||
    c.jobs.some(job => job.category !== 'success'))) return 2;
  return 0;
}

function assertCanonical() {
  if (contract.repository !== REPOSITORY || contract.canonicalBranch !== BRANCH || product.canonicalBranch !== BRANCH) {
    throw new Error('Canonical source contract mismatch');
  }
}

function makeApi(token, fetchImpl = fetch) {
  return async function api(endpoint) {
    // Caller cannot change origin or repository; redirects never receive the token.
    if (endpoint !== `repos/${REPOSITORY}` && !endpoint.startsWith(`repos/${REPOSITORY}/`)) {
      throw new Error('Noncanonical API endpoint');
    }
    const response = await fetchImpl(`https://api.github.com/${endpoint}`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: ['Bearer', token].join(' ') } : {}),
      },
      signal: AbortSignal.timeout(LIMITS.timeoutMs),
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return response.json();
  };
}

async function pages(api, endpoint, key) {
  const items = [];
  let total = null;
  for (let page = 1; page <= LIMITS.maxPages; page++) {
    const data = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${LIMITS.perPage}&page=${page}`);
    if (!Array.isArray(data[key]) || !Number.isInteger(data.total_count) || data.total_count < 0) {
      throw new Error('Invalid GitHub pagination response');
    }
    total = data.total_count;
    items.push(...data[key]);
    if (data[key].length < LIMITS.perPage || items.length >= total) {
      return { items, total, pages: page, truncated: items.length < total };
    }
  }
  return { items, total, pages: LIMITS.maxPages, truncated: true };
}

async function collect(api, now = new Date()) {
  assertCanonical();
  const generatedAt = now.toISOString();
  const since = new Date(now.getTime() - LIMITS.days * 86400000).toISOString();
  const base = `repos/${REPOSITORY}`;
  const report = {
    repository: REPOSITORY, branch: BRANCH, generatedAt, since,
    sha: null, commitDate: null, commitUrl: null, visibility: 'unknown',
    scope: 'Dernier run Actions par contrôle listé, HEAD canonique actuel, 7 derniers jours ; aucune conclusion de déploiement',
    limits: LIMITS, pagination: {}, controls: [], issues: [],
    exclusions: ['Workflows non listés (dont déploiements et ce workflow manuel)', 'Contrôles externes et statuts de commit', 'Artefacts, logs et signalements privés'],
  };
  const repo = await api(base);
  if (typeof repo.private !== 'boolean') throw new Error('Repository visibility unknown');
  report.visibility = repo.private ? 'private' : 'public';
  const head = await api(`${base}/commits/${encodeURIComponent(BRANCH)}`);
  if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('Invalid canonical HEAD SHA');
  report.sha = head.sha;
  report.commitDate = head.commit?.committer?.date || null;
  report.commitUrl = link(head.html_url);
  let runs = [];
  try {
    const result = await pages(api, `${base}/actions/runs?branch=${encodeURIComponent(BRANCH)}&head_sha=${report.sha}&created=${encodeURIComponent(`>=${since}`)}&exclude_pull_requests=true`, 'workflow_runs');
    report.pagination.runs = { total: result.total, pages: result.pages, truncated: result.truncated };
    if (result.truncated) report.issues.push('Run pagination bounded: latest control may be outside collected pages');
    runs = result.items.filter(run => run.head_branch === BRANCH && run.head_sha === report.sha && run.head_repository?.full_name === REPOSITORY);
  } catch {
    report.issues.push('Actions runs unavailable (API/network/permissions); controls unknown');
  }
  for (const file of CONTROLS) {
    const eligible = runs.filter(run => run.path?.split('@')[0] === `.github/workflows/${file}`);
    eligible.sort((a, b) => (b.run_number - a.run_number) || (b.run_attempt - a.run_attempt));
    const run = eligible[0];
    const control = { workflow: file, category: 'unknown', run: null, jobs: [], jobCounts: counts([]), jobsComplete: false };
    if (!run) {
      control.reason = 'No matching run observed within the declared bounds; never inferred success';
    } else {
      control.category = classify(run.status, run.conclusion);
      control.run = {
        id: run.id, attempt: run.run_attempt, sha: run.head_sha,
        status: run.status, conclusion: run.conclusion,
        createdAt: run.created_at || null, updatedAt: run.updated_at || null,
        url: link(run.html_url),
      };
      try {
        if (!Number.isSafeInteger(run.id) || run.id <= 0 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) {
          throw new Error('Invalid run ID/attempt');
        }
        // Fixed attempt: a concurrent rerun must not attach its jobs to old evidence.
        const result = await pages(api, `${base}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
        control.jobsPagination = { total: result.total, pages: result.pages, truncated: result.truncated };
        control.jobs = result.items.map(job => ({
          id: job.id, name: job.name, status: job.status, conclusion: job.conclusion,
          category: classify(job.status, job.conclusion),
          startedAt: job.started_at || null, completedAt: job.completed_at || null,
          url: link(job.html_url),
        }));
        control.jobCounts = counts(control.jobs);
        control.jobsComplete = !result.truncated && result.items.length > 0;
        if (!control.jobsComplete) report.issues.push(`${file}: jobs absent or pagination bounded`);
      } catch {
        report.issues.push(`${file}: jobs unavailable; no success inferred`);
      }
    }
    report.controls.push(control);
  }
  // Detect a moving branch rather than silently attach old evidence to a new HEAD.
  try {
    const current = await api(`${base}/commits/${encodeURIComponent(BRANCH)}`);
    if (current.sha !== report.sha) report.issues.push('Canonical HEAD changed during collection; report is a snapshot of the initial SHA');
  } catch {
    report.issues.push('Canonical HEAD could not be rechecked');
  }
  report.runCounts = counts(report.controls);
  report.complete = report.issues.length === 0 && report.controls.every(c => c.run && c.jobsComplete);
  // Even a successful workflow can have skipped jobs: no blanket PASS assertion.
  report.verdict = 'OBSERVED_ONLY';
  return report;
}

async function main() {
  try {
    const report = await collect(makeApi(process.env.GH_TOKEN));
    if (report.visibility !== 'public') {
      console.error('Rapport privé non publié : aucune métadonnée, synthèse ou artefact diffusé');
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify(report, null, 2));
    // A successful observation is not a green health check when a job was skipped.
    process.exitCode = reportExitCode(report);
    try {
      writeSummary(report);
    } catch {
      console.error('Synthèse locale indisponible : écriture impossible ; aucun détail sensible diffusé');
      if (process.exitCode === 0) process.exitCode = 2;
    }
  } catch {
    console.error('Rapport GitHub UNKNOWN : source canonique, visibilité ou API inaccessible ; aucun succès affirmé');
    process.exitCode = 2;
  }
}

if (require.main === module) main();
module.exports = { REPOSITORY, BRANCH, CONTROLS, LIMITS, classify, link, counts, reportExitCode, makeApi, pages, collect, summaryText, renderSummary, writeSummary };
