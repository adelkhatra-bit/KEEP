import express, { Router, Request, Response } from 'express';
import { computeFingerprint, lookupAcoustId, fetchIsrcFromMusicBrainz, FpcalcNotFoundError, AcoustIdError } from '../lib/acoustId';
import { matchLocal, addToLocalIndex, AudfprintNotConfiguredError } from '../lib/localFingerprintIndex';
import { resolveByFingerprintKey, findOrCreateTrack, recordFingerprintKey, isKeepLocalIndexConfigured } from '../lib/keepLocalIndexStore';
import { resolveQaCorpusTrack } from '../lib/qaCorpusMetadata';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { startTrace } from '../lib/requestTraces';

/**
 * Reconnaissance GRATUITE (Chromaprint/AcoustID/MusicBrainz), en amont
 * d'AudD dans la chaîne -- cf. RecognitionRouter.ts côté packages/music et
 * la recherche technique du 23/08/2026 (aucun wrapper mobile viable, donc
 * calcul d'empreinte ici, côté serveur).
 *
 * `express.raw` plutôt que multer : le mobile envoie l'échantillon audio
 * tel quel dans le corps de la requête (Content-Type audio/*), pas un
 * formulaire multipart -- une dépendance de moins.
 *
 * Protégé par une session KEEP réelle -- même raison que le developer token
 * Apple Music (voir routes/music.ts) : une clé AcoustID partagée exposée
 * sans contrôle d'accès serait une porte ouverte à l'abus (épuisement du
 * quota par n'importe qui, pas juste par de vrais utilisateurs KEEP).
 */
const router = Router();
const tokenVerifier = createSupabaseTokenVerifier();

/**
 * Limite invité (cf. demande explicite du 23/08/2026 : "1 ou 2 vraies
 * reconnaissances musicales gratuites en mode invité... pas seulement une
 * limite JavaScript facilement réinitialisable"). Compteur SERVEUR, par
 * user_id de session anonyme Supabase -- un client ne peut pas le
 * réinitialiser en rechargeant la page ou en modifiant le JS.
 *
 * STATUT HONNÊTE : en mémoire processus (pas en base) -- persiste tant que
 * le serveur tourne, remis à zéro à chaque redémarrage. Suffisant pour
 * empêcher un abus trivial (rechargement de page, extension JS) ; pas une
 * protection contre quelqu'un qui recrée délibérément des sessions anonymes
 * en boucle. Passer par `recognition_events` (déjà en base, migration 0002)
 * rendrait ça persistant -- nécessite une policy SELECT sur cette table
 * (actuellement écriture seule), à ajouter si ce niveau de protection ne
 * suffit plus.
 */
const GUEST_RECOGNITION_LIMIT = 2;
const guestAttemptCounts = new Map<string, number>();

function extensionFromContentType(contentType: string | undefined): string {
  const map: Record<string, string> = {
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  };
  const base = contentType?.split(';')[0]?.trim().toLowerCase();
  return (base && map[base]) || 'wav';
}

async function identifyHandler(req: KeepAuthedRequest, res: Response) {
  const trace = startTrace({
    userAgent: req.headers['user-agent'],
    buildId: (req.headers['x-keep-build-id'] as string) ?? null,
    sessionId: (req.headers['x-keep-session-id'] as string) ?? null,
    guestUserId: req.keepUserId,
  });
  console.log(`[KEEP][TRACE][${trace.requestId}] DEVICE=${trace.device} BUILD=${trace.buildId ?? '?'} SESSION=${trace.sessionId ?? '?'} GUEST=${trace.guestUserId}`);

  const apiKey = process.env.ACOUSTID_API_KEY;
  if (!apiKey) {
    trace.result = 'error';
    trace.resultDetail = 'acoustid_not_configured';
    res.status(501).json({
      error: 'acoustid_not_configured',
      requestId: trace.requestId,
      message:
        'ACOUSTID_API_KEY manquant côté backend -- créer une clé gratuite (usage non-commercial) sur acoustid.org/new-application et la renseigner dans packages/backend/.env.',
    });
    return;
  }

  if (req.keepIsAnonymous) {
    const used = guestAttemptCounts.get(req.keepUserId!) ?? 0;
    if (used >= GUEST_RECOGNITION_LIMIT) {
      // Pas une erreur technique -- un état normal, attendu (cf. demande
      // explicite du 23/08/2026 : "l'inscription doit devenir la
      // conséquence de la valeur qu'elle vient de découvrir").
      trace.result = 'error';
      trace.resultDetail = 'guest_limit_reached';
      console.log(`[KEEP][TRACE][${trace.requestId}] RESULT=guest_limit_reached`);
      res.status(403).json({
        error: 'guest_limit_reached',
        requestId: trace.requestId,
        message: `Limite invité atteinte (${GUEST_RECOGNITION_LIMIT} essais) -- crée un profil gratuit pour continuer.`,
      });
      return;
    }
    guestAttemptCounts.set(req.keepUserId!, used + 1);
  }

  const audio = req.body as Buffer;
  trace.audioReceivedBytes = Buffer.isBuffer(audio) ? audio.length : 0;
  if (!Buffer.isBuffer(audio) || audio.length === 0) {
    trace.wavValid = false;
    trace.result = 'error';
    trace.resultDetail = 'empty_body';
    console.log(`[KEEP][TRACE][${trace.requestId}] WAV_VALID=false (corps vide)`);
    res.status(400).json({ error: 'empty_body', requestId: trace.requestId, message: 'Aucun audio reçu -- envoyer l’échantillon en corps de requête brut (Content-Type audio/*).' });
    return;
  }
  trace.wavValid = audio.length > 1000; // seuil grossier -- un WAV exploitable pèse toujours plus que ça.
  const ext = extensionFromContentType(req.headers['content-type']);

  // ÉTAPE 1 -- KEEP Local Index (gratuit, instantané, zéro appel réseau).
  // Ne reconnaît QUE ce que KEEP a déjà confirmé une fois (cf. limite
  // honnête assumée, voir localFingerprintIndex.ts) -- un échec ici (pas
  // configuré, ou vraiment inconnu) tombe simplement à l'ÉTAPE 2, jamais
  // une erreur bloquante pour l'utilisateur.
  try {
    trace.audfprintCalled = true;
    trace.indexVersion = await fetchIndexVersion();
    const local = await matchLocal(audio, ext);
    if (local) {
      trace.matchScore = local.totalHashes > 0 ? Math.min(1, local.commonHashes / local.totalHashes) : 0;
      // Corpus QA (voir qaCorpusMetadata.ts) essayé EN PREMIER -- résolution
      // locale instantanée, ne dépend pas de la migration Supabase 0009
      // (pas encore appliquée). De vrais morceaux utilisateurs, eux,
      // passent par resolveByFingerprintKey (Supabase) juste après.
      const qaTrack = await resolveQaCorpusTrack(local.audfprintKey);
      const track = qaTrack ?? (isKeepLocalIndexConfigured() ? await resolveByFingerprintKey(req.keepAccessToken!, local.audfprintKey) : null);
      if (track) {
        trace.result = 'success';
        trace.resultDetail = `${track.title} — ${track.artist} [keep_local]`;
        trace.uiResultSent = true;
        console.log(`[KEEP][TRACE][${trace.requestId}] RESULT=success provider=keep_local title="${track.title}" score=${trace.matchScore}`);
        res.json({
          status: 'success',
          provider: 'keep_local',
          requestId: trace.requestId,
          title: track.title,
          artist: track.artist,
          // Math.min(1, ...) -- bug réel trouvé le 23/08/2026 : commonHashes
          // (comptage filtré/aligné d'audfprint) peut dépasser totalHashes
          // (hashes bruts de la requête, deux métriques distinctes côté
          // audfprint_match.py) et produire une "confiance" > 1, incohérent
          // pour une valeur qui doit toujours rester une proportion 0-1.
          confidence: trace.matchScore,
          isrc: 'isrc' in track ? track.isrc : undefined,
        });
        return;
      }
      // Un candidat audfprint existait mais ne résout vers AUCUN morceau
      // KEEP connu -- orphelin (clé jamais enregistrée côté Supabase, voir
      // audit du 23/08/2026). Distinct de "aucun candidat du tout".
      trace.noMatchReason = 'audfprint_match_orphan_no_metadata';
    } else {
      trace.noMatchReason = 'not_in_local_index';
    }
  } catch (e) {
    if (!(e instanceof AudfprintNotConfiguredError)) {
      console.warn('[KEEP][local-index] recherche locale échouée, repli sur AcoustID:', (e as Error).message);
      trace.noMatchReason = `local_index_error: ${(e as Error).message}`;
    } else {
      trace.audfprintCalled = false;
      trace.noMatchReason = 'audfprint_not_configured';
    }
  }

  // ÉTAPE 2 -- AcoustID (gratuit, limité, appel réseau).
  try {
    const fingerprint = await computeFingerprint(audio, ext);
    const match = await lookupAcoustId(fingerprint, apiKey);
    if (!match) {
      trace.result = 'no_match';
      trace.uiResultSent = true;
      console.log(`[KEEP][TRACE][${trace.requestId}] RESULT=no_match reason=${trace.noMatchReason ?? 'acoustid_no_match'}`);
      res.json({ status: 'no_match', requestId: trace.requestId });
      return;
    }
    const isrc = await fetchIsrcFromMusicBrainz(match.musicbrainzRecordingId).catch(() => undefined);
    trace.result = 'success';
    trace.resultDetail = `${match.title} — ${match.artist} [acoustid]`;
    trace.matchScore = match.score;
    trace.uiResultSent = true;
    console.log(`[KEEP][TRACE][${trace.requestId}] RESULT=success provider=acoustid title="${match.title}" score=${match.score}`);
    res.json({
      status: 'success',
      provider: 'acoustid',
      requestId: trace.requestId,
      title: match.title,
      artist: match.artist,
      confidence: match.score,
      musicbrainzId: match.musicbrainzRecordingId,
      isrc,
    });

    // Enrichissement de l'index local -- APRÈS la réponse (ne doit jamais
    // ralentir/faire échouer la reconnaissance en cours), c'est ce
    // mécanisme qui fait grossir le moteur KEEP gratuitement au fil des
    // reconnaissances réelles (cf. demande explicite du 23/08/2026).
    if (isKeepLocalIndexConfigured()) {
      enrichLocalIndex(req.keepAccessToken!, audio, ext, {
        title: match.title,
        artist: match.artist,
        isrc,
      }, match.score).catch((enrichError) => {
        console.warn('[KEEP][local-index] enrichissement échoué (reconnaissance déjà servie, sans impact utilisateur):', enrichError?.message);
      });
    }
  } catch (e) {
    trace.result = 'error';
    if (e instanceof FpcalcNotFoundError) {
      trace.resultDetail = 'fpcalc_not_installed';
      res.status(501).json({ error: 'fpcalc_not_installed', requestId: trace.requestId, message: e.message });
      return;
    }
    if (e instanceof AcoustIdError) {
      trace.resultDetail = 'acoustid_lookup_failed';
      res.status(502).json({ error: 'acoustid_lookup_failed', requestId: trace.requestId, message: e.message });
      return;
    }
    trace.resultDetail = (e as Error).message;
    res.status(500).json({ error: 'recognition_failed', requestId: trace.requestId, message: (e as Error).message });
  }
}

async function fetchIndexVersion(): Promise<{ tracks: number; hashes: number } | null> {
  const serviceUrl = process.env.KEEP_AUDFPRINT_SERVICE_URL;
  if (!serviceUrl) return null;
  try {
    const res = await fetch(`${serviceUrl}/health`, { signal: AbortSignal.timeout(3000) as any });
    if (!res.ok) return null;
    const json = (await res.json()) as { tracks: number; hashes: number };
    return { tracks: json.tracks, hashes: json.hashes };
  } catch {
    return null;
  }
}

async function enrichLocalIndex(
  accessToken: string,
  audio: Buffer,
  ext: string,
  meta: { title: string; artist: string; isrc?: string },
  confidence: number
): Promise<void> {
  const track = await findOrCreateTrack(accessToken, meta);
  const audfprintKey = await addToLocalIndex(audio, ext, track.id);
  await recordFingerprintKey(accessToken, track.id, audfprintKey, 'acoustid', confidence);
}

if (tokenVerifier) {
  router.post('/identify', requireKeepAuth(tokenVerifier), express.raw({ type: () => true, limit: '15mb' }), identifyHandler);
} else {
  router.post('/identify', (_req, res) => {
    res.status(503).json({
      error: 'auth_not_configured',
      message:
        'Authentification KEEP non configurée côté backend (SUPABASE_URL / SUPABASE_ANON_KEY manquants) -- endpoint désactivé par sécurité plutôt que servi sans contrôle d’accès.',
    });
  });
}

export default router;
