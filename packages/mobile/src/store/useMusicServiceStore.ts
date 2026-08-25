import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeStorage } from './safeStorage';

export type MusicServiceId = 'apple_music' | 'spotify' | 'youtube' | 'youtube_music';

/**
 * Services musicaux connectés = où KEEP peut chercher/ranger les morceaux
 * gardés (voir services/keepTrackAction.ts, UniversalTrackResolver).
 *
 * MULTI-SERVICE SIMULTANÉ (cf. demande explicite du 23/08/2026 -- "KEEP ne
 * doit plus être mono-service") : un tableau, pas une valeur unique.
 * Spotify + Apple Music + YouTube peuvent être connectés en même temps ;
 * UniversalTrackResolver interroge alors TOUTES les plateformes connectées
 * pour un même morceau, jamais une seule choisie arbitrairement.
 *
 * PERSISTÉ (AsyncStorage) -- cf. demande explicite du 23/08/2026 : ne plus
 * jamais effacer ce que l'utilisateur a déjà fait. Les jetons réels
 * (Spotify PKCE, Apple Music user token) vivent déjà dans expo-secure-store
 * (voir spotifyAuth.ts/appleMusicAuth.ts), donc persister CETTE liste de
 * services "marqués connectés" est cohérent : au rechargement, KEEP
 * retrouve les vrais jetons déjà sauvegardés plutôt que de redemander une
 * connexion pourtant déjà faite.
 *
 * MODE RÉEL : 'apple_music' (MusicKit JS) et 'spotify' (OAuth PKCE) peuvent
 * réellement se connecter -- 'youtube' a un provider REST réel écrit (voir
 * YouTubeProvider.ts) mais jamais exécuté de bout en bout (pas de clé API
 * Google fournie). 'youtube_music' n'a AUCUNE API officielle utilisable
 * légalement (voir recherche dans YouTubeProvider.ts) -- ne doit JAMAIS
 * passer à connecté en Mode Réel, quoi que l'utilisateur tape.
 * MODE DÉMO : les quatre peuvent être "connectés" de façon simulée et
 * clairement labellisée (démo).
 */
interface MusicServiceStore {
  connectedServices: MusicServiceId[];
  /** Un seul affichage de "Connecter un service musical ?" par session app -- jamais en boucle. */
  hasShownConnectPrompt: boolean;
  markConnectPromptShown: () => void;
  connectDemo: (service: MusicServiceId) => void;
  /** Appelé seulement après une authentification réelle réussie (voir *ConnectScreen.tsx). */
  connectReal: (service: MusicServiceId) => void;
  disconnect: (service: MusicServiceId) => void;
}

export const useMusicServiceStore = create<MusicServiceStore>()(
  persist(
    (set) => ({
      connectedServices: [],
      hasShownConnectPrompt: false,
      markConnectPromptShown: () => set({ hasShownConnectPrompt: true }),
      connectDemo: (service) =>
        set((s) => (s.connectedServices.includes(service) ? s : { connectedServices: [...s.connectedServices, service] })),
      connectReal: (service) =>
        set((s) => (s.connectedServices.includes(service) ? s : { connectedServices: [...s.connectedServices, service] })),
      disconnect: (service) => set((s) => ({ connectedServices: s.connectedServices.filter((id) => id !== service) })),
    }),
    { name: 'keep-music-services', storage: createSafeStorage() }
  )
);
