'use strict';
// Robot « Mes Sessions → Musiques partagées → Swipe » (export web, faux Supabase, données synthétiques).
// Vérifie : ouverture du Swipe, audio, gestes haut / PASSER / GARDER, fermeture, persistance après
// rechargement, et compte les écritures/relectures de synchro des sessions (détection des rafales).
// Aucun appel au vrai Supabase : tout le réseau externe est intercepté. Usage :
//   node e2e/journeys/session-swipe-robot.cjs <dossier export web>   (OUT=dossier des captures)
const http = require('http'); const fs = require('fs'); const path = require('path');
const fake = require('./fake-supabase.cjs');
const { chromium } = require('playwright');
const DIST = path.resolve(process.argv[2]); const PORT = 4723; const ORIGIN = `http://127.0.0.1:${PORT}`; const BASE = `${ORIGIN}/KEEP`;
const OUT = process.env.OUT || path.join(process.cwd(), 'artifacts', 'session-swipe-robot'); fs.mkdirSync(OUT, { recursive: true });
const MAX_SYNC_WRITES_IDLE = 2; const MAX_PULLS_IDLE_20S = 3;

function wav(seconds = 6) { const rate = 8000, n = rate * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), 44 + i * 2); return b; }
const WAV = wav();
function server() { const t = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
  return new Promise((r) => { const s = http.createServer((q, res) => { const u = decodeURIComponent(q.url.split('?')[0]);
    if (u.endsWith('/test.wav')) { res.writeHead(200, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' }); return res.end(WAV); }
    let f = path.join(DIST, u.replace(/^\/KEEP/, '') || '/'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': t[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }); s.listen(PORT, '127.0.0.1', () => r(s)); }); }

const now = Date.now();
const tracks = ['VIVE LA MONNAIE', 'MALVADA$', 'Titre trois'].map((title, i) => ({ id: `shared-entry-${i + 1}`, status: 'pending', detectedAt: new Date(now - (i + 1) * 60000).toISOString(), recommendations: [],
  track: { id: `shared-track-${i + 1}`, title, artist: `Artiste ${i + 1}`, artworkUrl: null, previewUrl: `${ORIGIN}/KEEP/test.wav` } }));
const shared = { ownerUserId: fake.UID, id: 'shared-session-1', startedAt: new Date(now - 3600000).toISOString(), endedAt: new Date(now - 1800000).toISOString(), title: 'Musiques partagées', tracks };
const history = { state: { sessions: [shared], dismissedKeepDecisionIds: [], dismissedSessionIds: Array.from({ length: 31 }, (_, i) => `old-${i}`), dismissedFavoriteImportIds: [] }, version: 0 };
// Cloud : la même session (clés dans un autre ordre, comme jsonb) + 31 sessions déjà supprimées.
const reorder = (o) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(o).reverse())));
const cloud = new Map([[shared.id, { session_id: shared.id, snapshot: reorder(shared), updated_at: new Date(now - 1800000).toISOString(), deleted_at: null }]]);
for (let i = 0; i < 31; i++) cloud.set(`old-${i}`, { session_id: `old-${i}`, snapshot: {}, updated_at: new Date(now - 86400000).toISOString(), deleted_at: new Date(now - 86400000).toISOString() });

(async () => {
  const srv = await server(); const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const r = { checks: {}, counts: {} }; const log = []; const t0 = Date.now(); const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  const counts = { sync_writes: 0, pulls: 0 }; const timeline = [];
  try {
    const sb = fake.createFakeSupabase({ origin: ORIGIN });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { window.__plays = 0; window.__pauses = 0; const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__plays++; window.__lastMedia = this; return p.apply(this, arguments); };
      const pa = HTMLMediaElement.prototype.pause; HTMLMediaElement.prototype.pause = function () { window.__pauses++; return pa.apply(this, arguments); }; });
    await ctx.addInitScript(([k, v, h]) => { try { if (!sessionStorage.getItem('robot-seeded')) { localStorage.setItem(k, v); localStorage.setItem('keep_has_seen_onboarding_guide', 'true'); localStorage.setItem('keep-session-history', h); sessionStorage.setItem('robot-seeded', '1'); } } catch {} }, [fake.AUTH_STORAGE_KEY, JSON.stringify(sb.session), JSON.stringify(history)]);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
    await page.route((u) => !u.href.startsWith(ORIGIN), async (route) => { const req = route.request(); const u = new URL(req.url());
      if (/keep_download_credit_status/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan_code: 'FREE', consumed: 0, credit_limit: 100, remaining: 100, unlimited: false, cost_per_keep: 3 }) });
      if (u.pathname.endsWith('/rpc/keep_sync_device_session')) { counts.sync_writes++; timeline.push(`${stamp()}s write`); let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch {}
        const prev = cloud.get(b.p_session_id); if (prev && prev.deleted_at && !b.p_deleted) return route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
        cloud.set(b.p_session_id, { session_id: b.p_session_id, snapshot: b.p_deleted ? {} : b.p_snapshot, updated_at: new Date().toISOString(), deleted_at: b.p_deleted ? (prev?.deleted_at || new Date().toISOString()) : null });
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }); }
      if (u.pathname === '/rest/v1/keep_device_sessions') { counts.pulls++; timeline.push(`${stamp()}s pull`); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...cloud.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) }); }
      if (/supabase\.co/.test(u.hostname)) return sb.respond(route);
      if (u.href.startsWith('data:') || u.href.startsWith('blob:')) return route.continue(); return route.abort(); });
    const shot = (n) => page.screenshot({ path: path.join(OUT, n) }).catch(() => {});
    const player = () => page.locator('[data-testid="story-player"]').last();
    const title = async () => { const t = await player().innerText().catch(() => ''); const m = t.match(/VIVE LA MONNAIE|MALVADA\$|Titre trois|Swipe terminé/); return m ? m[0] : null; };
    const audioPlaying = () => page.evaluate(() => Boolean(window.__lastMedia && !window.__lastMedia.paused));
    const watchTitles = () => page.evaluate(() => { window.__seq = []; window.__t0 = performance.now(); const mo = new MutationObserver(() => { const el = [...document.querySelectorAll('[data-testid="story-player"]')].pop(); const m = (el?.innerText || '').match(/VIVE LA MONNAIE|MALVADA\$|Titre trois|Swipe terminé/); const v = m ? m[0] : '-'; if (!window.__seq.length || window.__seq[window.__seq.length - 1].split('@')[0] !== v) window.__seq.push(v + '@' + Math.round(performance.now() - window.__t0)); }); mo.observe(document.body, { subtree: true, childList: true, characterData: true }); });

    await page.goto(`${BASE}/`, { waitUntil: 'load' }); await page.getByText('Passer', { exact: true }).first().click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000); await shot('1-ecouter.png');
    // 1) Synchro au repos : 20 s sans action.
    const w0 = counts.sync_writes, p0 = counts.pulls; await page.waitForTimeout(20000);
    r.counts.idle_writes = counts.sync_writes - w0; r.counts.idle_pulls = counts.pulls - p0; r.counts.startup_writes = w0; r.counts.startup_pulls = p0;
    r.checks.pas_de_rafale_au_demarrage = w0 <= MAX_SYNC_WRITES_IDLE;
    r.checks.pas_de_rafale_au_repos = r.counts.idle_writes <= MAX_SYNC_WRITES_IDLE && r.counts.idle_pulls <= MAX_PULLS_IDLE_20S;
    // 2) Mes Sessions → Musiques partagées.
    const menu = page.locator('[data-testid="home-sessions-menu"]').first(); await menu.waitFor({ timeout: 30000 }); await menu.tap(); await page.waitForTimeout(1500); await shot('2-mes-sessions.png');
    await page.getByText('Musiques partagées', { exact: false }).first().tap(); await page.waitForTimeout(3500); await shot('3-session-swipe.png');
    r.checks.swipe_affiche = await player().isVisible().catch(() => false);
    r.titre_1 = await title(); r.checks.audio_demarre = await page.evaluate(() => window.__plays > 0);
    // 3) Glisser vers le haut → morceau suivant.
    const cdp = await ctx.newCDPSession(page); const vp = page.viewportSize(); const X = vp.width / 2;
    const swipe = async (x0, y0, x1, y1) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(1500); };
    await watchTitles(); await swipe(X, vp.height * 0.55, X, vp.height * 0.2); r.titre_2 = await title(); r.sequence_un_geste = await page.evaluate(() => window.__seq);
    r.checks.haut_suivant = Boolean(r.titre_1 && r.titre_2 && r.titre_1 !== r.titre_2); r.checks.un_seul_morceau_par_geste = r.titre_1 === 'VIVE LA MONNAIE' && r.titre_2 === 'MALVADA$'; await shot('4-apres-haut.png');
    await swipe(X, vp.height * 0.6, X, vp.height * 0.25); r.titre_2b = await title(); r.checks.deuxieme_geste_suivant = r.titre_2b === 'Titre trois';
    r.lectures_audio = await page.evaluate(() => window.__plays);
    // Fermer (ARRÊTER) pendant la lecture, puis rouvrir.
    await page.getByText('ARRÊTER', { exact: true }).last().tap().catch(() => {}); await page.waitForTimeout(1500); await shot('4b-ferme.png');
    r.checks.ferme = !(await player().isVisible().catch(() => false)); r.checks.son_coupe = !(await audioPlaying());
    await page.getByText(/SWIPER \/ PRÉÉCOUTER/).first().tap().catch(() => {}); await page.waitForTimeout(3000); r.checks.rouvert = await player().isVisible().catch(() => false); r.titre_reouverture = await title();
    // 4) PASSER (bouton) puis GARDER (geste droite) : décisions enregistrées.
    await page.getByText('PASSER', { exact: true }).last().tap().catch(() => {}); await page.waitForTimeout(1500); r.titre_3 = await title(); await shot('5-apres-passer.png');
    await swipe(X - 120, vp.height * 0.5, X + 150, vp.height * 0.5); await page.waitForTimeout(1500); await shot('6-apres-garder.png');
    const choice = page.getByText(/Public|Privé/).first(); if (await choice.isVisible().catch(() => false)) { await choice.tap().catch(() => {}); await page.waitForTimeout(1500); }
    await page.getByText(/ARRÊTER|FERMER|Fermer/).last().tap().catch(() => {}); await page.waitForTimeout(1500); await shot('7-fin.png');
    const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('keep-session-history') || '{}'); } catch { return {}; } });
    const statuses = (saved?.state?.sessions || []).find((s) => s.id === 'shared-session-1')?.tracks?.map((t) => t.status) || [];
    r.statuts_avant_rechargement = statuses; r.checks.choix_enregistres = statuses.some((s) => s !== 'pending');
    // 6) Redémarrage (rechargement) : les choix sont toujours là.
    const w1 = counts.sync_writes; await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(6000);
    const after = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('keep-session-history') || '{}'); } catch { return {}; } });
    const statuses2 = (after?.state?.sessions || []).find((s) => s.id === 'shared-session-1')?.tracks?.map((t) => t.status) || [];
    r.statuts_apres_rechargement = statuses2; r.checks.choix_persistants = statuses2.length > 0 && JSON.stringify(statuses2) === JSON.stringify(statuses);
    r.counts.reload_writes = counts.sync_writes - w1; r.checks.pas_de_rafale_au_rechargement = r.counts.reload_writes <= MAX_SYNC_WRITES_IDLE;
    r.counts.total_writes = counts.sync_writes; r.counts.total_pulls = counts.pulls; r.erreurs_page = errs;
  } catch (e) { r.exception = String(e.message || e).slice(0, 400); }
  r.timeline_synchro = timeline.slice(0, 60);
  const failed = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
  r.resultat = r.exception ? 'ERREUR' : failed.length ? `ÉCHEC : ${failed.join(', ')}` : 'OK';
  fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r, null, 1)); await browser.close(); srv.close(); process.exit(r.resultat === 'OK' ? 0 : 1);
})();
