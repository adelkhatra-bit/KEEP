import { create } from 'zustand';
import { ProviderPlaylist } from '@keep/music';
import { musicEngine } from '../services/musicEngine';
import { useMusicServiceStore } from './useMusicServiceStore';

/**
 * Les playlists affichées viennent TOUJOURS de musicEngine.musicProvider
 * (source unique — cf. règle "une donnée créée une seule fois puis
 * réutilisée partout"). Aucune liste mock parallèle ici.
 *
 * GARDE EXPLICITE (cf. demande explicite du 23/08/2026 -- "Mes musiques
 * contient visiblement des données en dur") : `musicEngine.musicProvider`
 * renvoie le catalogue Mode Démo dès que EXPO_PUBLIC_DEMO_MODE!=='false',
 * INDÉPENDAMMENT de toute connexion réelle -- avant ce correctif, "Mes
 * musiques" affichait Piscine/Afro House/etc. même sans qu'aucun service
 * n'ait jamais été connecté, présentées comme si c'étaient les vraies
 * playlists de l'utilisateur. On n'interroge donc plus le provider tant
 * qu'aucun service n'est explicitement connecté (useMusicServiceStore) --
 * liste vide sinon, jamais un catalogue fictif en repli silencieux.
 */
interface PlaylistStore {
  playlists: ProviderPlaylist[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  playlists: [],
  isLoading: false,
  refresh: async () => {
    if (useMusicServiceStore.getState().connectedServices.length === 0) {
      set({ playlists: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    const session = await musicEngine.getSession();
    const playlists = await musicEngine.musicProvider.getPlaylists(session);
    set({ playlists, isLoading: false });
  },
}));
