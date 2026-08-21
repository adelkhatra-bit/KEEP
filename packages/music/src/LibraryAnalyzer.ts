import { CanonicalTrack, ProviderPlaylist } from './types';

export interface LibraryAnalysis {
  totalTracks: number;
  unclassifiedCount: number;
  duplicateGroups: CanonicalTrack[][];
  duplicateCount: number;
}

/**
 * "RANGER MA MUSIQUE" (§17) — analyse réelle de l'état actuel des playlists
 * du provider connecté. Ne fabrique aucun chiffre : si l'utilisateur n'a
 * encore rien rangé, l'analyse renvoie des compteurs à zéro plutôt qu'un
 * exemple illustratif codé en dur.
 *
 * Détection de doublons : même ISRC, ou à défaut même couple
 * titre+artiste normalisé, apparaissant dans plusieurs playlists.
 * Ne restructure jamais automatiquement — retourne des propositions,
 * charge à l'écran d'exiger une validation utilisateur avant toute action.
 */
export function analyzeLibrary(playlistsWithTracks: { playlist: ProviderPlaylist; tracks: CanonicalTrack[] }[]): LibraryAnalysis {
  const allTracks = playlistsWithTracks.flatMap((p) => p.tracks);
  const key = (t: CanonicalTrack) => t.isrc ?? `${t.title.toLowerCase().trim()}::${t.artist.toLowerCase().trim()}`;

  const groups = new Map<string, CanonicalTrack[]>();
  for (const track of allTracks) {
    const k = key(track);
    const group = groups.get(k) ?? [];
    group.push(track);
    groups.set(k, group);
  }

  const duplicateGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  const unclassifiedCount = allTracks.filter((t) => !t.genres || t.genres.length === 0).length;

  return {
    totalTracks: allTracks.length,
    unclassifiedCount,
    duplicateGroups,
    duplicateCount: duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0),
  };
}
