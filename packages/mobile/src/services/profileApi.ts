/**
 * Appels réels backend pour le profil KEEP (cf. demande explicite du
 * 24/08/2026 -- "profil → Supabase → fermeture/réouverture → profil
 * toujours présent"). Avant ce fichier, useUserStore ne parlait jamais au
 * backend malgré que routes/social.ts fonctionne réellement -- un profil
 * rempli restait uniquement dans l'AsyncStorage de CET appareil/onglet.
 *
 * Fire-and-forget pour les écritures (jamais bloquer l'UI sur un PATCH
 * réseau) -- mêmes conventions que sendDevDiagnostic/sendTraceStep dans
 * useSessionStore.ts. Échec réseau = log console, jamais une erreur visible
 * pour une simple sauvegarde de profil (l'état local reste la source de
 * vérité immédiate pour l'utilisateur, le serveur suit derrière).
 */
import { getSupabaseAccessToken } from './supabaseClient';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

async function authedFetch(path: string, init: RequestInit): Promise<Response | null> {
  if (!API_URL) return null;
  const token = await getSupabaseAccessToken();
  if (!token) return null;
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

export interface RemoteProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  city: string | null;
  countryCode: string | null;
  kind: string;
  isPublic: boolean;
  followerCount: number;
  followingCount: number;
  socialLinks: { platform: string; url: string; visibility: string }[];
  birthDate: string | null;
  gender: string | null;
}

/** Hydrate le profil depuis le serveur -- `null` si pas encore créé côté serveur ou hors-ligne (jamais une erreur bloquante, l'état local persiste). */
export async function fetchRemoteProfile(): Promise<RemoteProfile | null> {
  try {
    const res = await authedFetch('/api/social/me', { method: 'GET' });
    if (!res || !res.ok) return null;
    const json = (await res.json()) as { data: RemoteProfile };
    return json.data;
  } catch {
    return null;
  }
}

/**
 * BUG RÉEL corrigé le 24/08/2026 (Adel : "ça fait 10 fois que je mets une
 * photo/que je change le nom, ça s'enregistre pas") : ces fonctions ne
 * vérifiaient JAMAIS `res.ok` -- un rejet serveur (413 payload trop gros,
 * contrainte violée, RLS...) échouait à 100% en silence, aucun log, aucune
 * trace. `fetch()` ne rejette QUE sur un échec réseau, jamais sur un
 * statut HTTP d'erreur -- d'où le `.catch()` seul qui ne voyait rien passer.
 * Reste fire-and-forget côté UI (jamais bloquer un enregistrement de profil
 * sur le réseau, voir en-tête de fichier) mais un échec RÉEL doit au moins
 * apparaître en console -- sans ça, un futur bug de ce type redeviendrait
 * aussi invisible que celui-ci l'a été.
 */
async function logIfFailed(label: string, resPromise: Promise<Response | null>): Promise<void> {
  try {
    const res = await resPromise;
    if (res && !res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[KEEP][profile-sync] ${label} échoué (état local conservé): HTTP ${res.status} ${body}`);
    }
  } catch (e: any) {
    console.warn(`[KEEP][profile-sync] ${label} échoué (état local conservé):`, e?.message);
  }
}

export interface RemoteKeep {
  id: string;
  decision: 'KEPT' | 'PASSED';
  created_at: string;
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  tracks: {
    id: string;
    title: string;
    artist: string;
    album: string | null;
    artwork_url: string | null;
    isrc: string | null;
    provider_ids: Record<string, string>;
  };
}

/**
 * BUG RÉEL trouvé le 24/08/2026 (Adel : "que son album reste préenregistré,
 * chaque mise à jour ne doit pas impacter les utilisateurs") : `keep_decisions`
 * est bien persisté serveur depuis longtemps (`routes/social.ts` /me/keeps),
 * mais AUCUN écran ne le lisait jamais -- `MyMusicScreen.tsx` s'appuyait
 * uniquement sur `useSessionHistoryStore` (AsyncStorage, cet appareil
 * uniquement). Un morceau réellement gardé survivait donc au redémarrage de
 * l'app, mais PAS à un changement d'appareil ni à un stockage vidé, alors
 * que le serveur avait la vraie donnée depuis le début. `null` = hors-ligne/
 * pas encore de session -- jamais une erreur bloquante, l'historique local
 * reste affiché tel quel.
 */
export async function fetchMyKeeps(): Promise<RemoteKeep[] | null> {
  try {
    const res = await authedFetch('/api/social/me/keeps', { method: 'GET' });
    if (!res || !res.ok) return null;
    const json = (await res.json()) as { data: RemoteKeep[] };
    return json.data;
  } catch {
    return null;
  }
}

export interface ProfileKeepRow {
  id: string;
  createdAt: string;
  track: { id: string; title: string; artist: string; album: string | null; artworkUrl: string | null };
}

/**
 * BUG RÉEL trouvé le 24/08/2026 (audit visuel réel demandé par Adel --
 * "vérifie que les morceaux découverts et autorisés en partage apparaissent
 * réellement sur le profil public") : `GET /api/social/profiles/:username/keeps`
 * fonctionne et est testé côté backend depuis le début de cette session
 * (voir keep-visibility-test.ts), mais AUCUN écran mobile ne l'appelait --
 * PublicProfilePreview.tsx affichait uniquement des données LOCALES
 * (sessions de CET appareil), jamais les vrais morceaux PUBLIC du serveur.
 * Testé en vrai dans le navigateur : "Voir mon profil comme un visiteur"
 * n'affichait ZÉRO morceau malgré 4 vrais morceaux PUBLIC créés côté
 * serveur pour ce compte. Cette route filtre déjà TOUJOURS sur
 * visibility=PUBLIC côté serveur (jamais d'exception propriétaire) --
 * l'appeler avec son propre token donne donc exactement ce qu'un vrai
 * visiteur verrait, sans logique supplémentaire nécessaire ici.
 */
export async function fetchProfileKeeps(username: string): Promise<ProfileKeepRow[] | null> {
  try {
    const res = await authedFetch(`/api/social/profiles/${encodeURIComponent(username)}/keeps`, { method: 'GET' });
    if (!res || !res.ok) return null;
    const json = (await res.json()) as {
      data: { id: string; created_at: string; tracks: { id: string; title: string; artist: string; album: string | null; artwork_url: string | null } }[];
    };
    return json.data.map((k) => ({
      id: k.id,
      createdAt: k.created_at,
      track: { id: k.tracks.id, title: k.tracks.title, artist: k.tracks.artist, album: k.tracks.album, artworkUrl: k.tracks.artwork_url },
    }));
  } catch {
    return null;
  }
}

export function pushProfilePatch(patch: Record<string, unknown>): void {
  logIfFailed('PATCH /me', authedFetch('/api/social/me', { method: 'PATCH', body: JSON.stringify(patch) }));
}

export function pushPrivateInfoPatch(patch: { birth_date?: string | null; gender?: string | null }): void {
  logIfFailed('PATCH /me/private-info', authedFetch('/api/social/me/private-info', { method: 'PATCH', body: JSON.stringify(patch) }));
}

export function pushSocialLinks(links: { platform: string; url: string; visibility: string }[]): void {
  logIfFailed('PUT /me/social-links', authedFetch('/api/social/me/social-links', { method: 'PUT', body: JSON.stringify({ links }) }));
}

/**
 * BUG RÉEL trouvé le 24/08/2026 (en construisant le partage/masquage par
 * morceau demandé par Adel) : `POST /api/social/me/keeps` existe et
 * fonctionne côté backend depuis longtemps (voir e2e-smoke-test.ts,
 * `hydrateFromServer` qui LIT déjà ce que ce endpoint écrit), mais RIEN côté
 * mobile ne l'appelait jamais -- GARDER un morceau (reconnaissance réelle)
 * ne l'écrivait QUE localement (AsyncStorage), jamais côté serveur. Donc :
 * "Mes musiques" ne survit pas à un changement d'appareil, un profil visité
 * n'affiche jamais de vrais morceaux découverts, et aucun toggle
 * visibilité/partage n'a de ligne serveur à modifier. Fire-and-forget, même
 * convention que le reste de ce fichier -- ne bloque jamais GARDER sur le
 * réseau, l'état local reste la source de vérité immédiate.
 */
/**
 * Retourne l'`id` réel `keep_decisions` créé côté serveur -- `null` si
 * hors-ligne/échec (jamais bloquant pour l'UI, voir logIfFailed), mais
 * DOIT être awaited et le résultat stocké (`SessionTrackEntry.keepId`) par
 * l'appelant : sans lui, aucune action serveur ultérieure sur ce KEEP
 * précis (visibilité partagé/masqué, etc.) n'est possible (cf. audit du
 * 24/08/2026 -- identifiant local et serveur ne se correspondaient jamais).
 */
export async function pushKeepDecision(track: {
  title: string; artist: string; album?: string; isrc?: string; artworkUrl?: string;
}): Promise<string | null> {
  const resPromise = authedFetch('/api/social/me/keeps', {
    method: 'POST',
    body: JSON.stringify({
      title: track.title, artist: track.artist, album: track.album,
      isrc: track.isrc, artworkUrl: track.artworkUrl, decision: 'KEPT',
    }),
  });
  try {
    const res = await resPromise;
    if (!res || !res.ok) {
      if (res) console.warn(`[KEEP][profile-sync] POST /me/keeps échoué (état local conservé): HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { data?: { id?: string } };
    return json.data?.id ?? null;
  } catch (e: any) {
    console.warn('[KEEP][profile-sync] POST /me/keeps échoué (état local conservé):', e?.message);
    return null;
  }
}

/** Partager (PUBLIC) ou masquer (PRIVATE) un KEEP sur le profil -- ne retire jamais le morceau de "Mes musiques" (voir PATCH /me/keeps/:id/visibility, social.ts). */
export async function patchKeepVisibility(keepId: string, visibility: 'PUBLIC' | 'PRIVATE'): Promise<boolean> {
  const res = await authedFetch(`/api/social/me/keeps/${keepId}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ visibility }),
  });
  if (!res || !res.ok) {
    if (res) console.warn(`[KEEP][profile-sync] PATCH /me/keeps/${keepId}/visibility échoué: HTTP ${res.status}`);
    return false;
  }
  return true;
}
