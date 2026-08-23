import { MusicRecognitionProvider } from './providers/MusicRecognitionProvider';
import { RecognitionResult } from './types';

export interface RecognitionAttempt {
  providerId: string;
  outcome: 'success' | 'no_match' | 'error';
  detail?: string;
}

export interface RecognitionRouterResult {
  result: RecognitionResult | null;
  /** Provider qui a effectivement fourni le résultat -- undefined si aucun n'a trouvé de correspondance. */
  matchedProviderId?: string;
  /** Une entrée par provider RÉELLEMENT interrogé, dans l'ordre -- jamais une liste inventée. */
  attempts: RecognitionAttempt[];
}

/**
 * RecognitionRouter -- orchestre plusieurs MusicRecognitionProvider par
 * ordre de priorité (cf. demande explicite du 23/08/2026 : "KEEP cache ->
 * AcoustID -> fallback provider -> AudD", "AudD devient un fallback, pas le
 * moteur principal obligatoire").
 *
 * Essaie chaque provider dans l'ordre fourni ; s'arrête au premier match
 * réel. Un provider qui échoue (erreur réseau, clé manquante...) ne bloque
 * jamais les suivants -- il est journalisé comme 'error' et le routeur
 * continue, jamais une session cassée parce qu'UN provider est en panne.
 *
 * STATUT HONNÊTE (23/08/2026) : un seul provider réel existe aujourd'hui
 * (AudD). La liste `providers` n'a donc qu'une entrée en pratique -- ce
 * fichier est l'emplacement d'extension pour un futur provider gratuit
 * (AcoustID/Chromaprint, en cours de recherche technique) qui prendrait la
 * première position, AudD passant alors réellement en fallback plutôt que
 * seul moteur.
 */
export class RecognitionRouter {
  constructor(private readonly providers: MusicRecognitionProvider[]) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionRouterResult> {
    const attempts: RecognitionAttempt[] = [];
    for (const provider of this.providers) {
      try {
        const result = await provider.recognize(audioSample);
        if (result) {
          attempts.push({ providerId: provider.providerId, outcome: 'success' });
          return { result, matchedProviderId: provider.providerId, attempts };
        }
        attempts.push({ providerId: provider.providerId, outcome: 'no_match' });
      } catch (e: any) {
        attempts.push({ providerId: provider.providerId, outcome: 'error', detail: e?.message });
        // Un provider en panne (quota, réseau...) ne doit jamais empêcher le
        // suivant de la chaîne d'essayer -- c'est tout l'intérêt du fallback.
      }
    }
    return { result: null, attempts };
  }

  async recognizeFromUrl(url: string): Promise<RecognitionRouterResult> {
    const attempts: RecognitionAttempt[] = [];
    for (const provider of this.providers) {
      if (!provider.recognizeFromUrl) continue;
      try {
        const result = await provider.recognizeFromUrl(url);
        if (result) {
          attempts.push({ providerId: provider.providerId, outcome: 'success' });
          return { result, matchedProviderId: provider.providerId, attempts };
        }
        attempts.push({ providerId: provider.providerId, outcome: 'no_match' });
      } catch (e: any) {
        attempts.push({ providerId: provider.providerId, outcome: 'error', detail: e?.message });
      }
    }
    return { result: null, attempts };
  }

  /** true si au moins un provider de la chaîne sait analyser un lien -- pilote l'affichage d'un éventuel bouton "lien" côté UI. */
  get supportsUrl(): boolean {
    return this.providers.some((p) => typeof p.recognizeFromUrl === 'function');
  }

  /**
   * Mode PARALLÈLE + FUSION (cf. demande explicite du 23/08/2026 -- "lance
   * plusieurs moteurs en parallèle... fusionne leurs résultats", exemple
   * donné : "Dejavu: 0.94, audfprint: 0.91, même artiste/titre -> confiance
   * HIGH"). Distinct de `recognize()` (séquentiel, chaîne de repli) --
   * n'a de sens QUE pour des moteurs réellement INDÉPENDANTS et GRATUITS
   * (ex. deux index locaux différents), jamais pour inclure un provider
   * payant/à quota limité (le lancer "juste au cas où" gâcherait son quota
   * même quand un moteur gratuit aurait suffi -- voir `recognize()` pour la
   * chaîne de production réelle, qui reste séquentielle).
   *
   * STATUT HONNÊTE (23/08/2026) : écrit et prêt, mais actuellement UN SEUL
   * moteur local gratuit existe réellement (KEEP Local Index/audfprint,
   * exposé côté mobile comme l'étape "acoustid" du RecognitionRouter --
   * voir routes/recognition.ts) -- rien d'autre à fusionner avec pour
   * l'instant (Dejavu non prototypé, bloqué sur une vraie base
   * MySQL/Postgres non disponible dans cet environnement, voir audit du
   * 23/08/2026). Cette méthode devient utile dès qu'un DEUXIÈME moteur
   * local indépendant existe.
   */
  async recognizeParallel(providers: MusicRecognitionProvider[], audioSample: ArrayBuffer | Blob): Promise<RecognitionRouterResult> {
    const settled = await Promise.allSettled(providers.map((p) => p.recognize(audioSample)));
    const attempts: RecognitionAttempt[] = [];
    const candidates: { providerId: string; result: RecognitionResult }[] = [];

    settled.forEach((s, i) => {
      const providerId = providers[i].providerId;
      if (s.status === 'rejected') {
        attempts.push({ providerId, outcome: 'error', detail: (s.reason as Error)?.message });
      } else if (!s.value) {
        attempts.push({ providerId, outcome: 'no_match' });
      } else {
        attempts.push({ providerId, outcome: 'success' });
        candidates.push({ providerId, result: s.value });
      }
    });

    if (candidates.length === 0) return { result: null, attempts };
    if (candidates.length === 1) return { result: candidates[0].result, matchedProviderId: candidates[0].providerId, attempts };

    return this.fuseCandidates(candidates, attempts);
  }

  /**
   * Fusion réelle -- règle explicite (cf. demande) : deux moteurs d'accord
   * (même ISRC, ou même titre+artiste en minuscules) -> confiance boostée
   * (jamais > 1) et provider composite "fused(a+b)" ; en désaccord -> le
   * plus confiant gagne tel quel, sans invention de consensus.
   */
  private fuseCandidates(
    candidates: { providerId: string; result: RecognitionResult }[],
    attempts: RecognitionAttempt[]
  ): RecognitionRouterResult {
    const sameTrack = (a: RecognitionResult, b: RecognitionResult) =>
      (a.isrc && b.isrc && a.isrc === b.isrc) || (a.title.toLowerCase() === b.title.toLowerCase() && a.artist.toLowerCase() === b.artist.toLowerCase());

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        if (sameTrack(candidates[i].result, candidates[j].result)) {
          const best = candidates[i].result.confidence >= candidates[j].result.confidence ? candidates[i] : candidates[j];
          const boosted = Math.min(1, Math.max(candidates[i].result.confidence, candidates[j].result.confidence) + 0.05);
          return {
            result: { ...best.result, confidence: boosted },
            matchedProviderId: `fused(${candidates[i].providerId}+${candidates[j].providerId})`,
            attempts,
          };
        }
      }
    }

    // Désaccord -- le plus confiant gagne, jamais un consensus inventé.
    const best = candidates.reduce((a, b) => (b.result.confidence > a.result.confidence ? b : a));
    return { result: best.result, matchedProviderId: best.providerId, attempts };
  }
}
