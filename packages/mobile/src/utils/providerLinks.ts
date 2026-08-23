/**
 * KEEP est un MIROIR, jamais un hébergeur -- aucune donnée audio n'est
 * stockée ici (cf. demande explicite du 22/08/2026 : "on est un miroir...
 * pour l'écouter entière il faut passer sur le profil de la plateforme").
 * Ces liens ouvrent directement la vraie plateforme (app installée si
 * possible, sinon le Web) plutôt que de faire semblant de lire quoi que ce
 * soit dans KEEP.
 *
 * STATUT HONNÊTE par plateforme :
 * - Spotify : URL publique stable pour toute playlist/morceau -> lien réel.
 * - Apple Music : les playlists de bibliothèque PERSONNELLE n'ont pas d'URL
 *   web publique (contrairement au catalogue) -- l'API ne l'expose pas,
 *   confirmé dans AppleMusicProvider.ts. Retourne `undefined`, jamais un
 *   lien inventé qui mènerait nulle part.
 * - Démo : aucune vraie plateforme derrière -- `undefined`.
 */
export function getPlaylistProviderUrl(providerId: string, playlistId: string): string | undefined {
  if (providerId === 'spotify') return `https://open.spotify.com/playlist/${playlistId}`;
  return undefined;
}

export function getTrackProviderUrl(providerId: string, trackProviderId: string): string | undefined {
  if (providerId === 'spotify') return `https://open.spotify.com/track/${trackProviderId}`;
  return undefined;
}
