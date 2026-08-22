import { create } from 'zustand';

export type MusicServiceId = 'apple_music' | 'spotify' | 'youtube_music';

/**
 * Service musical connecté = où KEEP synchronise les morceaux gardés (voir
 * services/keepTrackAction.ts). Un seul service actif à la fois pour cette
 * itération (même contrainte que musicEngine.musicProvider aujourd'hui).
 *
 * MODE RÉEL : 'apple_music' (flux MusicKit JS, voir AppleMusicConnectScreen.tsx)
 * et 'spotify' (flux OAuth PKCE, voir spotifyAuth.ts + SpotifyConnectScreen.tsx)
 * peuvent réellement se connecter -- 'youtube_music' n'a encore aucun code
 * d'intégration (voir docs/PROJECT_STATUS.md) et ne doit JAMAIS passer à
 * connected=true en Mode Réel, quoi que l'utilisateur tape.
 * MODE DÉMO : les trois peuvent être "connectés" de façon simulée et
 * clairement labellisée (démo) -- sert à démontrer le parcours complet
 * GARDER -> Waiting to Sync -> connexion -> Sync Now sans compte réel.
 */
interface MusicServiceStore {
  connectedService: MusicServiceId | null;
  /** Un seul affichage de "Connecter un service musical ?" par session app -- jamais en boucle. */
  hasShownConnectPrompt: boolean;
  markConnectPromptShown: () => void;
  connectDemo: (service: MusicServiceId) => void;
  /** Appelé seulement après une authentification réelle réussie (voir *ConnectScreen.tsx). */
  connectReal: (service: 'apple_music' | 'spotify') => void;
  disconnect: () => void;
}

export const useMusicServiceStore = create<MusicServiceStore>((set) => ({
  connectedService: null,
  hasShownConnectPrompt: false,
  markConnectPromptShown: () => set({ hasShownConnectPrompt: true }),
  connectDemo: (service) => set({ connectedService: service }),
  connectReal: (service) => set({ connectedService: service }),
  disconnect: () => set({ connectedService: null }),
}));
