/**
 * KEEP Local Index -- moteur de reconnaissance GRATUIT et local (cf.
 * demande explicite du 23/08/2026 : "micro -> KEEP database -> résultat,
 * sans payer une API. Plus KEEP est utilisé, plus notre propre moteur
 * devient puissant").
 *
 * S'appuie sur audfprint (MIT, github.com/dpwe/audfprint -- licence vérifiée
 * le 23/08/2026, voir packages/recognition-engine/).
 *
 * SERVICE PERSISTANT (cf. demande explicite du 23/08/2026 -- "8,8s est trop
 * lent... transforme audfprint en service persistant") : la latence
 * observée en réel ne venait PAS d'audfprint lui-même, mais du fait que
 * chaque requête relançait tout l'interpréteur Python ET relisait le
 * fichier .pklz entier depuis le disque (visible dans les logs : "Reading
 * hash table..." à chaque appel). packages/recognition-engine/audfprint_service.py
 * charge le HashTable UNE SEULE FOIS au démarrage et le garde en mémoire --
 * ce module lui parle en HTTP (KEEP_AUDFPRINT_SERVICE_URL). Repli honnête
 * sur l'ancien sous-processus CLI si le service n'est pas configuré/joignable
 * -- jamais un faux échec juste parce qu'une option plus rapide manque.
 *
 * LIMITE HONNÊTE ASSUMÉE (cf. demande explicite du 23/08/2026) : audfprint
 * ne reconnaît QUE les morceaux déjà présents dans NOTRE base -- ce n'est
 * pas un remplacement d'AcoustID/AudD pour un morceau jamais entendu par
 * KEEP, c'est un cache qui grossit. Voir routes/recognition.ts pour l'ordre
 * réel de la chaîne : index local d'abord (gratuit, instantané), puis
 * AcoustID, puis (côté mobile) AudD en dernier recours.
 *
 * AUCUN AUDIO PROTÉGÉ N'EST CONSERVÉ : le service comme le repli CLI
 * n'écrivent un fichier audio temporaire que le temps de calculer les
 * landmarks, puis le suppriment. Le fichier .pklz ne contient que des
 * hashes (empreintes), jamais l'audio source.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

const DB_DIR = process.env.KEEP_LOCAL_INDEX_DIR ?? path.join(process.cwd(), 'data', 'keep-local-index');
const DB_PATH = path.join(DB_DIR, 'fingerprints.pklz');
const PYTHON_BIN = process.env.KEEP_AUDFPRINT_PYTHON;
const AUDFPRINT_SCRIPT = process.env.KEEP_AUDFPRINT_SCRIPT;
const SERVICE_URL = process.env.KEEP_AUDFPRINT_SERVICE_URL;

export class AudfprintNotConfiguredError extends Error {
  constructor() {
    super(
      'KEEP_AUDFPRINT_SERVICE_URL (ou KEEP_AUDFPRINT_PYTHON / KEEP_AUDFPRINT_SCRIPT) manquants -- voir packages/recognition-engine/README.md.'
    );
    this.name = 'AudfprintNotConfiguredError';
  }
}

export interface LocalFingerprintMatch {
  /** Clé stable ("<trackId>.wav") -- se résout vers un vrai morceau via la table keep_fingerprints. */
  audfprintKey: string;
  commonHashes: number;
  totalHashes: number;
}

function isConfigured(): boolean {
  return !!SERVICE_URL || (!!PYTHON_BIN && !!AUDFPRINT_SCRIPT);
}

async function dbExists(): Promise<boolean> {
  try {
    await stat(DB_PATH);
    return true;
  } catch {
    return false;
  }
}

async function writeTempAudio(audio: Buffer, ext: string, name?: string): Promise<string> {
  const dir = path.join(os.tmpdir(), 'keep-audfprint');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name ?? randomUUID()}.${ext}`);
  await writeFile(file, audio);
  return file;
}

/**
 * Cherche l'échantillon dans la base locale -- gratuit, aucun appel externe.
 * `null` = pas de correspondance (base vide, ou morceau réellement inconnu
 * de KEEP) -- jamais une erreur pour ce cas normal, voir routes/recognition.ts
 * qui enchaîne alors sur AcoustID.
 */
export async function matchLocal(audio: Buffer, ext: string): Promise<LocalFingerprintMatch | null> {
  if (!isConfigured()) throw new AudfprintNotConfiguredError();

  if (SERVICE_URL) {
    const res = await fetch(`${SERVICE_URL}/match`, { method: 'POST', body: audio as any, signal: AbortSignal.timeout(15000) as any });
    if (!res.ok) throw new Error(`audfprint-service /match -> HTTP ${res.status}`);
    const json = (await res.json()) as { matched: boolean; key?: string; commonHashes?: number; totalHashes?: number };
    if (!json.matched || !json.key) return null;
    return { audfprintKey: json.key, commonHashes: json.commonHashes ?? 0, totalHashes: json.totalHashes ?? 0 };
  }

  // Repli CLI (sous-processus par requête -- lent, ~8-9s, voir historique
  // du 23/08/2026) -- utilisé UNIQUEMENT si le service persistant n'est pas configuré.
  if (!(await dbExists())) return null; // rien indexé pour l'instant -- état normal au tout début
  const tmpFile = await writeTempAudio(audio, ext);
  try {
    const { stdout } = await execFileAsync(PYTHON_BIN!, [AUDFPRINT_SCRIPT!, 'match', '--dbase', DB_PATH, tmpFile], { timeout: 30000 });
    const m = stdout.match(/as\s+(\S+)\s+at\s+[\d.]+\s+s\s+with\s+(\d+)\s+of\s+(\d+)\s+common hashes/);
    if (!m) return null;
    return { audfprintKey: path.basename(m[1]), commonHashes: Number(m[2]), totalHashes: Number(m[3]) };
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

// audfprint réécrit tout le fichier .pklz à chaque ajout (pas une vraie
// base transactionnelle) -- deux écritures concurrentes se marcheraient
// dessus. File d'attente en mémoire, suffisante pour un seul process
// backend/service (pas un verrou distribué).
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Enrichit la base locale avec un morceau confirmé par un autre provider
 * (AcoustID) ou par le corpus QA -- c'est CE mécanisme qui fait grossir le
 * moteur KEEP au fil des reconnaissances réelles. `trackId` (uuid Supabase
 * `tracks.id`, ou clé QA stable) sert de clé stable dans la base audfprint
 * -- voir table `keep_fingerprints` (migration 0009) pour la correspondance
 * clé -> TrackIdentity complet.
 */
export async function addToLocalIndex(audio: Buffer, ext: string, trackId: string): Promise<string> {
  if (!isConfigured()) throw new AudfprintNotConfiguredError();
  const run = writeQueue.then(() => performAdd(audio, ext, trackId));
  writeQueue = run.catch(() => {});
  return run;
}

async function performAdd(audio: Buffer, ext: string, trackId: string): Promise<string> {
  const audfprintKey = `${trackId}.${ext}`;

  if (SERVICE_URL) {
    const res = await fetch(`${SERVICE_URL}/add`, {
      method: 'POST',
      headers: { 'X-Track-Key': audfprintKey },
      body: audio as any,
      signal: AbortSignal.timeout(30000) as any,
    });
    if (!res.ok) throw new Error(`audfprint-service /add -> HTTP ${res.status}`);
    return audfprintKey;
  }

  await mkdir(DB_DIR, { recursive: true });
  const tmpFile = await writeTempAudio(audio, ext, trackId);
  try {
    const command = (await dbExists()) ? 'add' : 'new';
    await execFileAsync(PYTHON_BIN!, [AUDFPRINT_SCRIPT!, command, '--dbase', DB_PATH, tmpFile], { timeout: 30000 });
    return audfprintKey;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
