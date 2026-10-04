const crypto = require('node:crypto');

const required = ['ASC_API_KEY_P8_BASE64','ASC_KEY_ID','ASC_ISSUER_ID','ASC_APP_ID'];
const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) throw new Error('Missing Apple secrets: ' + missing.join(', '));

const key = Buffer.from(process.env.ASC_API_KEY_P8_BASE64.trim(), 'base64');
const enc = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = enc({ alg:'ES256', kid:process.env.ASC_KEY_ID.trim(), typ:'JWT' }) + '.' +
  enc({ iss:process.env.ASC_ISSUER_ID.trim(), iat:now-30, exp:now+600, aud:'appstoreconnect-v1' });
const token = unsigned + '.' + crypto.sign('sha256', Buffer.from(unsigned), {
  key,
  dsaEncoding:'ieee-p1363'
}).toString('base64url');

const appId = process.env.ASC_APP_ID.trim();
const expectedBuildNumber = String(process.env.EXPECTED_BUILD_NUMBER || '').trim();
const waitMinutes = Math.max(0, Math.min(30, Number(process.env.WAIT_MINUTES || 0)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, options = {}) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const text = await res.text();
  if (options.allow404 && res.status === 404) return null;
  if (!res.ok) {
    const err = new Error((options.label || path) + ': Apple HTTP ' + res.status);
    err.status = res.status;
    err.safeBody = text.slice(0, 500);
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function latestBuild() {
  const data = await api('/v1/builds?filter[app]=' + encodeURIComponent(appId) +
    '&sort=-uploadedDate&fields[builds]=version,uploadedDate,processingState,expired,buildAudienceType&limit=50');
  const rows = data.data || [];
  const candidate = rows.find((x) => {
    if (expectedBuildNumber && String(x.attributes?.version) !== expectedBuildNumber) return false;
    return x.attributes?.processingState === 'VALID' && !x.attributes?.expired;
  });
  return candidate || null;
}

async function waitForBuild() {
  const deadline = Date.now() + waitMinutes * 60_000;
  do {
    const build = await latestBuild();
    if (build) return build;
    if (Date.now() >= deadline) break;
    console.log('TestFlight build not VALID yet; waiting 30s…');
    await sleep(30_000);
  } while (true);
  throw new Error(expectedBuildNumber
    ? 'Build ' + expectedBuildNumber + ' not VALID in App Store Connect before timeout'
    : 'No VALID TestFlight build found');
}

async function relationIds(path) {
  const data = await api(path);
  return new Set((data.data || []).map((x) => x.id));
}

async function ensureBetaReviewIfNeeded(buildId, outsideTesterCount) {
  if (!outsideTesterCount) return { needed:false, state:'INTERNAL_ONLY' };
  const detail = await api('/v1/builds/' + buildId +
    '/buildBetaDetail?fields[buildBetaDetails]=autoNotifyEnabled,internalBuildState,externalBuildState');
  const attrs = detail?.data?.attributes || {};
  const state = attrs.externalBuildState || null;
  if (state !== 'READY_FOR_BETA_SUBMISSION') {
    return { needed:true, state, autoNotifyEnabled:attrs.autoNotifyEnabled ?? null };
  }

  const existing = await api('/v1/betaAppReviewSubmissions?filter[build]=' + encodeURIComponent(buildId) +
    '&fields[betaAppReviewSubmissions]=betaReviewState,submittedDate&limit=20');
  if ((existing.data || []).length > 0) {
    return {
      needed:true,
      state:(existing.data || [])[0]?.attributes?.betaReviewState || state,
      alreadySubmitted:true,
      autoNotifyEnabled:attrs.autoNotifyEnabled ?? null,
    };
  }

  await api('/v1/betaAppReviewSubmissions', {
    method:'POST',
    label:'Submit beta review',
    body:{
      data:{
        type:'betaAppReviewSubmissions',
        relationships:{
          build:{ data:{ type:'builds', id:buildId } }
        }
      }
    }
  });
  return { needed:true, state:'SUBMITTED_FOR_BETA_REVIEW', alreadySubmitted:false, autoNotifyEnabled:attrs.autoNotifyEnabled ?? null };
}

(async () => {
  const build = await waitForBuild();
  const buildId = build.id;
  const buildNumber = String(build.attributes?.version || '');

  const [testers, groups] = await Promise.all([
    api('/v1/betaTesters?filter[apps]=' + encodeURIComponent(appId) +
      '&fields[betaTesters]=state,inviteType&limit=200'),
    api('/v1/apps/' + appId +
      '/betaGroups?fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds&limit=200'),
  ]);

  const allTesters = testers.data || [];
  const automaticTesterIds = new Set();
  for (const group of (groups.data || [])) {
    if (!group.attributes?.hasAccessToAllBuilds) continue;
    const ids = await relationIds('/v1/betaGroups/' + group.id + '/relationships/betaTesters?limit=200');
    for (const id of ids) automaticTesterIds.add(id);
  }

  const outside = allTesters.filter((tester) => !automaticTesterIds.has(tester.id));
  let newlyAssigned = 0;
  for (const tester of outside) {
    const builds = await relationIds('/v1/betaTesters/' + tester.id + '/relationships/builds?limit=200');
    if (builds.has(buildId)) continue;
    await api('/v1/betaTesters/' + tester.id + '/relationships/builds', {
      method:'POST',
      label:'Assign latest build to tester',
      body:{ data:[{ type:'builds', id:buildId }] },
    });
    newlyAssigned += 1;
  }

  const review = await ensureBetaReviewIfNeeded(buildId, outside.length);

  console.log('=== LOKI TESTFLIGHT TESTER SYNC ===');
  console.log(JSON.stringify({
    buildNumber,
    processingState:build.attributes?.processingState || null,
    totalTesters:allTesters.length,
    testersCoveredByAutomaticGroups:automaticTesterIds.size,
    testersOutsideAutomaticGroups:outside.length,
    newlyAssignedToLatestBuild:newlyAssigned,
    betaReview:review,
  }, null, 2));
  console.log('=== END LOKI TESTFLIGHT TESTER SYNC ===');

  if (outside.length > 0 && review.autoNotifyEnabled === false) {
    throw new Error('Latest build has external testers but TestFlight auto-notify is disabled');
  }
})().catch((error) => {
  console.error(error?.message || String(error));
  if (error?.safeBody) console.error('Apple response:', error.safeBody);
  process.exit(1);
});
