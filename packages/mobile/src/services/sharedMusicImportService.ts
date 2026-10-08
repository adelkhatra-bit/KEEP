import { create } from 'zustand';
import { supabase } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';

export type SharedMusicTrack = {
  id?: string;
  title: string;
  artist: string;
  isrc?: string;
  artworkUrl?: string;
  genres?: string[];
  platformLinks: Record<string, string>;
};
export type SharedMusicResolution = { track: SharedMusicTrack; imported?: boolean; alreadyImported?: boolean };
export type SharedLibraryItem = {
  id: string;
  provider: string;
  title: string;
  artist: string;
  artwork_url?: string | null;
  metadata?: { platformLinks?: Record<string, string> } | null;
};
export type MyMusicStats = {
  topGenres: { name: string; count: number }[];
  topArtists: { name: string; count: number }[];
  hearts: number;
  dislikes: number;
  keeps: number;
  importedByPlatform: Record<string, number>;
};

export const useSharedMusicImportStore = create<{ revision: number; ownerId: string | null; message: string | null; clearMessage: () => void }>((set) => ({
  revision: 0, ownerId: null, message: null,
  clearMessage: () => set({ message: null }),
}));

export function requireMusicImportAccount(): string {
  const state = useUserStore.getState();
  if (!state.user?.id || state.isLocalGuest || state.isDemoMode) {
    throw new Error('Connecte-toi à un compte Loki Music pour ajouter une musique. Le mode Démo ne permet pas l’import.');
  }
  return state.user.id;
}

export function musicLinkFromText(text: string): string {
  const url = text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (!url) throw new Error('Copie un lien musical, puis touche ＋ Ajouter un lien.');
  return url;
}

export async function resolveSharedMusicLink(url: string, preview = false): Promise<SharedMusicResolution> {
  const ownerId = requireMusicImportAccount();
  const client = supabase;
  if (!client) throw new Error('Service musical indisponible. Réessaie.');
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || auth.user?.id !== ownerId || auth.user.is_anonymous) {
    throw new Error('Connecte-toi à un compte Loki Music pour ajouter une musique.');
  }
  // Le compte peut changer pendant la vérification réseau : aucun invoke en démo/invité.
  if (requireMusicImportAccount() !== ownerId) throw new Error('Le compte a changé. Réessaie.');
  const { data, error } = await client.functions.invoke('keep-resolve-music-link', {
    body: preview ? { url, preview: true } : { url },
  });
  if (error) throw new Error('Impossible de résoudre ce lien musical. Réessaie.');
  if (!data?.track?.title || !data?.track?.artist || !data.track.platformLinks) {
    throw new Error('Aucune musique trouvée pour ce lien.');
  }
  const result = data as SharedMusicResolution;
  if (!preview) {
    if (!result.imported && !result.alreadyImported) throw new Error('La musique n’a pas été ajoutée. Réessaie.');
    if (useUserStore.getState().user?.id === ownerId) {
      useSharedMusicImportStore.setState((state) => ({
        revision: state.revision + 1, ownerId,
        message: result.alreadyImported ? 'Déjà dans ton profil' : 'Ajouté à ton profil',
      }));
    }
  }
  return result;
}

export async function loadSharedMusicLibrary(): Promise<SharedLibraryItem[]> {
  const ownerId = requireMusicImportAccount();
  if (!supabase) throw new Error('Service musical indisponible.');
  const { data, error } = await supabase.from('music_library_items')
    .select('id,provider,title,artist,artwork_url,metadata')
    .eq('profile_id', ownerId).is('removed_at', null)
    .order('imported_at', { ascending: false }).limit(200);
  if (error) throw new Error('Impossible de charger tes musiques. Réessaie.');
  return data ?? [];
}

export async function loadMyMusicStats(): Promise<MyMusicStats> {
  requireMusicImportAccount();
  if (!supabase) throw new Error('Service musical indisponible.');
  const { data, error } = await supabase.rpc('keep_my_music_stats');
  if (error || !data) throw new Error('Statistiques indisponibles. Réessaie.');
  const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const normalizeRanking = (entries: unknown): { name: string; count: number }[] => {
    if (!Array.isArray(entries)) throw new Error('Statistiques indisponibles. Réessaie.');
    return entries.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new Error('Statistiques indisponibles. Réessaie.');
      const row = entry as Record<string, unknown>;
      const name = [row.name, row.label, row.taste_key].find((value) => typeof value === 'string' && value.trim());
      const count = row.count ?? row.score;
      if (typeof name !== 'string' || !validCount(count)) throw new Error('Statistiques indisponibles. Réessaie.');
      return { name: name.trim(), count };
    });
  };
  if (!data.imported || typeof data.imported !== 'object' || Array.isArray(data.imported)
    || !Object.values(data.imported).every(validCount)
    || ![data.hearts, data.dislikes, data.keeps].every(validCount)) {
    throw new Error('Statistiques indisponibles. Réessaie.');
  }
  return {
    topGenres: normalizeRanking(data.genres),
    topArtists: normalizeRanking(data.artists),
    hearts: data.hearts, dislikes: data.dislikes, keeps: data.keeps,
    importedByPlatform: data.imported,
  };
}
