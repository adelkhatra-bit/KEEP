import { MusicRecognitionProvider } from './MusicRecognitionProvider';
import { RecognitionResult } from '../types';

/**
 * Implémentation RÉELLE du MusicRecognitionProvider pour Chromaprint/
 * AcoustID/MusicBrainz -- GRATUIT, placé devant AudD dans la chaîne (voir
 * RecognitionRouter). Recherche technique menée le 23/08/2026 avant
 * d'écrire ce fichier : aucun wrapper Chromaprint mobile/WASM n'est
 * maintenu, le calcul d'empreinte doit se faire côté serveur (fpcalc,
 * child_process) -- voir packages/backend/src/lib/acoustId.ts et
 * routes/recognition.ts. Ce provider ne fait donc PAS le calcul lui-même :
 * il envoie l'échantillon audio au backend KEEP, qui fait le travail réel.
 *
 * STATUT HONNÊTE : nécessite EXPO_PUBLIC_API_URL (backend KEEP joignable)
 * ET une session KEEP réelle (Supabase Auth -- endpoint protégé, voir
 * routes/recognition.ts) ET ACOUSTID_API_KEY + le binaire `fpcalc` installés
 * côté serveur. Sans l'un de ces trois, le provider échoue honnêtement
 * (jamais un faux "aucune correspondance" qui masquerait un problème de
 * configuration) -- voir RecognitionRouter pour le comportement de repli
 * vers AudD quand ce provider échoue.
 */
export class AcoustIdRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'acoustid';

  constructor(
    private readonly config: {
      apiUrl: string;
      /** Jeton de session KEEP réel (Supabase Auth) -- jamais un jeton inventé. */
      getAccessToken: () => Promise<string | null>;
      /** Cf. demande explicite du 23/08/2026 -- identifie DEVICE/BUILD/SESSION dans le traçage backend (voir requestTraces.ts). */
      buildId?: string;
      sessionId?: string;
    },
    // .bind(globalThis) -- même correctif Safari que les autres providers, voir AudDRecognitionProvider.ts.
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis)
  ) {}

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    const accessToken = await this.config.getAccessToken();
    if (!accessToken) {
      throw new Error('AcoustID : aucune session KEEP active -- connecte-toi pour activer la reconnaissance gratuite.');
    }

    const blob = audioSample instanceof Blob ? audioSample : new Blob([audioSample]);
    const res = await this.fetchImpl(`${this.config.apiUrl}/api/recognition/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'audio/wav',
        Authorization: `Bearer ${accessToken}`,
        ...(this.config.buildId ? { 'X-Keep-Build-Id': this.config.buildId } : {}),
        ...(this.config.sessionId ? { 'X-Keep-Session-Id': this.config.sessionId } : {}),
      },
      body: blob as any,
    });

    const json = (await res.json()) as {
      status?: 'success' | 'no_match';
      error?: string;
      message?: string;
      title?: string;
      artist?: string;
      confidence?: number;
      musicbrainzId?: string;
      isrc?: string;
      /** 'keep_local' | 'acoustid' -- vrai moteur backend, voir RecognitionResult.engine. */
      provider?: string;
      /** Cf. demande explicite du 23/08/2026 -- traçage E2E. */
      requestId?: string;
    };

    if (!res.ok) {
      // `json.error` (code machine, ex. 'guest_limit_reached') gardé dans le
      // message -- permet à useSessionStore de distinguer "invité à
      // convertir" (état normal) d'une vraie panne, sans casser l'API
      // MusicRecognitionProvider (qui ne renvoie que RecognitionResult|null).
      // requestId inclus -- traçable même en cas d'erreur (voir requestTraces.ts).
      throw new Error(`AcoustID : ${json.message ?? `HTTP ${res.status}`}${json.error ? ` [${json.error}]` : ''}${json.requestId ? ` (requestId=${json.requestId})` : ''}`);
    }
    if (json.status !== 'success' || !json.title || !json.artist) {
      return null; // 'no_match' -- pas de correspondance, jamais un résultat inventé.
    }

    return {
      // AcoustID fournit un vrai score continu (contrairement à AudD) -- voir lookupAcoustId côté backend.
      confidence: json.confidence ?? 0,
      title: json.title,
      artist: json.artist,
      isrc: json.isrc,
      recognitionProviderTrackId: json.musicbrainzId,
      // Pas de jaquette : nécessiterait un appel Cover Art Archive supplémentaire, pas encore branché.
      engine: json.provider,
      requestId: json.requestId,
    };
  }
}
