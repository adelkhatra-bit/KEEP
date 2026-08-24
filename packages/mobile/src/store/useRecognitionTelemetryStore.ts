import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeStorage } from './safeStorage';

/**
 * Journal réel des appels au provider de reconnaissance -- pas une
 * estimation, un enregistrement de CE QUI S'EST PASSÉ à chaque tentative
 * (cf. demande explicite du 23/08/2026, Super Admin -> "nombre d'appels,
 * erreurs, taux de reconnaissance, latence moyenne").
 *
 * Persisté en local (AsyncStorage) -- même statut honnête que
 * useSessionHistoryStore : aucun backend Supabase KEEP déployé, donc pas
 * encore visible depuis Super Admin (app séparée, pas d'accès à
 * l'AsyncStorage du mobile). CODÉ, pas CONNECTED tant que ce flux ne
 * transite pas par un vrai backend -- ne pas annoncer plus que ça.
 */
export type RecognitionOutcome = 'success' | 'no_match' | 'already_seen' | 'already_owned' | 'quota_error' | 'error';

export interface RecognitionEvent {
  id: string;
  timestamp: string;
  providerId: string;
  source: 'mic' | 'link';
  outcome: RecognitionOutcome;
  latencyMs: number;
  /** Détail technique brut (message provider, code erreur) -- jamais montré tel quel à l'utilisateur, voir useSessionStore. */
  detail?: string;
}

const MAX_EVENTS = 200;

interface RecognitionTelemetryStore {
  events: RecognitionEvent[];
  log: (event: Omit<RecognitionEvent, 'id' | 'timestamp'>) => void;
  clear: () => void;
}

export const useRecognitionTelemetryStore = create<RecognitionTelemetryStore>()(
  persist(
    (set) => ({
      events: [],
      log: (event) =>
        set((s) => ({
          events: [
            { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toISOString(), ...event },
            ...s.events,
          ].slice(0, MAX_EVENTS),
        })),
      clear: () => set({ events: [] }),
    }),
    { name: 'keep-recognition-telemetry', storage: createSafeStorage() }
  )
);
