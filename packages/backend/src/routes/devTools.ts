import express, { Router } from 'express';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getTrace, listTraces, confirmDisplay, addStep, TraceStep } from '../lib/requestTraces';

/**
 * Outils DEV uniquement (cf. demande explicite du 23/08/2026 -- "bouton
 * TEST RECONNAISSANCE... doit être uniquement DEV/ADMIN et disparaître de
 * la production"). Sert le corpus QA (packages/recognition-engine/qa-corpus/,
 * pistes 100% composées par FFmpeg, aucun souci de droits -- voir
 * generate_qa_corpus.py) pour que l'app mobile puisse tester le VRAI
 * RecognitionRouter avec un fichier connu, sans dépendre d'un vrai micro.
 *
 * Désactivé si NODE_ENV=production, quoi qu'il arrive -- jamais exposé en
 * prod, même si quelqu'un oublie de retirer l'import côté index.ts.
 */
const router = Router();
const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'recognition-engine', 'qa-corpus');

const IS_PROD = process.env.NODE_ENV === 'production';

router.get('/qa-corpus', async (_req, res) => {
  if (IS_PROD) return void res.status(404).end();
  try {
    const files = (await readdir(CORPUS_DIR)).filter((f) => f.endsWith('.wav'));
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: 'qa_corpus_unavailable', message: (e as Error).message });
  }
});

router.get('/qa-corpus/:name', async (req, res) => {
  if (IS_PROD) return void res.status(404).end();
  const name = path.basename(req.params.name); // jamais de traversée de chemin, même en dev.
  if (!name.endsWith('.wav')) return void res.status(400).json({ error: 'invalid_name' });
  try {
    const audio = await readFile(path.join(CORPUS_DIR, name));
    res.setHeader('Content-Type', 'audio/wav');
    res.send(audio);
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

/**
 * Diagnostic RÉEL d'une capture micro (cf. demande explicite du 23/08/2026
 * -- "ne suppose rien, mesure-le"). Juste un console.log structuré,
 * consultable en direct via `tail` côté serveur -- pas besoin d'un vrai
 * écran Super Admin pour ce diagnostic ponctuel. Jamais actif en production.
 */
/** Le build actuellement servi -- ce que le backend reçoit depuis process.env.KEEP_EXPECTED_BUILD_ID (voir .env), rempli manuellement au même moment que EXPO_PUBLIC_BUILD_ID côté mobile. Sert uniquement à cross-vérifier un diagnostic reçu. */
function parseDeviceType(userAgent: string | undefined): 'iPhone' | 'PC/Desktop' | 'Android' | 'unknown' {
  if (!userAgent) return 'unknown';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iPhone';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows|Macintosh|Linux/.test(userAgent)) return 'PC/Desktop';
  return 'unknown';
}

router.post('/diagnostic-log', express.json(), (req, res) => {
  if (IS_PROD) return void res.status(404).end();
  const body = req.body as { userAgent?: string; buildId?: string };
  const deviceType = parseDeviceType(body.userAgent);
  const expectedBuild = process.env.KEEP_EXPECTED_BUILD_ID;
  const buildMatch = expectedBuild ? (body.buildId === expectedBuild ? 'MATCH' : `MISMATCH (attendu: ${expectedBuild})`) : '(KEEP_EXPECTED_BUILD_ID non renseigné côté backend)';
  console.log(`[KEEP][DIAGNOSTIC][SUMMARY] DEVICE=${deviceType} BUILD=${buildMatch}`);
  console.log('[KEEP][DIAGNOSTIC]', JSON.stringify(req.body, null, 2));
  res.status(204).end();
});

const CAPTURE_DIR = path.join(__dirname, '..', '..', 'data', 'diagnostic-captures');

/**
 * Sauvegarde l'échantillon RÉEL capté par le micro d'un utilisateur (dev
 * uniquement) pour comparaison directe avec le corpus QA (durée, amplitude,
 * spectre, sample rate, poids -- cf. demande explicite du 23/08/2026, étape
 * 5 du test comparatif). Jamais gardé au-delà du diagnostic -- fichier de
 * travail, pas une base de données d'audio utilisateur.
 */
router.post('/capture-sample', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  if (IS_PROD) return void res.status(404).end();
  try {
    await mkdir(CAPTURE_DIR, { recursive: true });
    const filename = `capture-${Date.now()}.wav`;
    await writeFile(path.join(CAPTURE_DIR, filename), req.body as Buffer);
    console.log(`[KEEP][DIAGNOSTIC] échantillon micro sauvegardé pour inspection: ${filename} (${(req.body as Buffer).length} octets)`);
    res.json({ saved: filename });
  } catch (e) {
    res.status(500).json({ error: 'save_failed', message: (e as Error).message });
  }
});

/**
 * Traçage E2E par requête (cf. demande explicite du 23/08/2026 -- "logue un
 * identifiant unique de requête... visible dans le Super Admin pour suivre
 * cette capture iPhone de bout en bout"). Pas encore une vraie page Super
 * Admin (voir requestTraces.ts pour le statut honnête) -- ces deux routes
 * donnent la même visibilité pour ce diagnostic ciblé.
 */
router.get('/traces', (_req, res) => {
  if (IS_PROD) return void res.status(404).end();
  res.json({ traces: listTraces() });
});

router.get('/trace/:id', (req, res) => {
  if (IS_PROD) return void res.status(404).end();
  const trace = getTrace(req.params.id);
  if (!trace) return void res.status(404).json({ error: 'not_found' });
  res.json(trace);
});

/**
 * Étape client d'une trace (cf. demande explicite du 23/08/2026 -- "trace
 * une tentative réelle avec un REQUEST_ID unique depuis mon clic jusqu'au
 * résultat : USER_TAP -> MICRO_STARTED -> AUDIO_CAPTURED -> ... -> UI_RESULT,
 * PASS/FAIL + durée pour chaque étape"). SANS auth -- appelé AVANT même que
 * le mobile ait un jeton de session (c'est justement l'étape qu'on cherche à
 * observer), donc ce endpoint ne peut pas dépendre de requireKeepAuth.
 */
router.post('/trace-step', express.json(), (req, res) => {
  if (IS_PROD) return void res.status(404).end();
  const body = req.body as { requestId?: string; step?: TraceStep['name']; status?: TraceStep['status']; detail?: string };
  if (!body.requestId || !body.step || !body.status) return void res.status(400).json({ error: 'missing_fields' });
  addStep(body.requestId, body.step, body.status, body.detail);
  console.log(`[KEEP][TRACE][${body.requestId}] STEP=${body.step} STATUS=${body.status}${body.detail ? ` DETAIL=${body.detail}` : ''}`);
  res.status(204).end();
});

/** Appelé par le mobile juste après avoir rendu le résultat à l'écran -- distingue "réponse envoyée" (uiResultSent, déjà vrai côté serveur) de "réellement affiché" (confirmé par le client). */
router.post('/trace/:id/confirm-display', express.json(), (req, res) => {
  if (IS_PROD) return void res.status(404).end();
  const ok = confirmDisplay(req.params.id);
  res.status(ok ? 204 : 404).end();
});

export default router;
