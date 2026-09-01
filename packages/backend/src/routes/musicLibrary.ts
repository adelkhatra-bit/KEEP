import { createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import {
  addTrackToConnectedPlaylist,
  findTrackAcrossConnectedPlaylists,
  getConnectedPlaylistTracks,
  importConnectedSavedLibrary,
  listConnectedPlaylists,
  listImportedMusicLibrary,
  listPendingSessionImports,
  setImportedMusicVisibility,
  syncFavoritesForAllConnectedProfiles,
  syncKeepPlaylistToConnectedProvider,
} from '../lib/connectedMusicLibrary';

const router = Router();
const verifier = createSupabaseTokenVerifier();

// AJOUT (02/09/2026) : même mécanisme que keep-push-worker (Edge Function) --
// un secret Vault + son hash SHA-256 dans keep_internal_worker_secrets,
// jamais le secret en clair ailleurs. pg_cron appelle ce endpoint toutes les
// 30 minutes avec l'en-tête x-keep-worker-key ; aucun JWT utilisateur n'est
// impliqué, donc cette route ne passe pas par `guard`.
async function verifyFavoritesSyncWorkerKey(req: Request): Promise<boolean> {
  const supplied = String(req.header('x-keep-worker-key') || '');
  if (!supplied) return false;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const database = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await database
    .from('keep_internal_worker_secrets')
    .select('secret_hash')
    .eq('name', 'favorites-sync-worker')
    .maybeSingle();
  if (error || !data?.secret_hash) return false;
  return createHash('sha256').update(supplied).digest('hex') === String(data.secret_hash);
}

type Provider = 'spotify' | 'deezer';
type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';

function validProvider(value: unknown): value is Provider {
  return value === 'spotify' || value === 'deezer';
}

function canonicalFromBody(body: any) {
  const title = String(body?.title || '').trim();
  const artist = String(body?.artist || '').trim();
  const isrc = body?.isrc ? String(body.isrc).trim() : undefined;
  if (!title || !artist) return null;
  return { title, artist, isrc };
}

async function playlistsHandler(req: KeepAuthedRequest, res: Response) {
  try {
    const data = await listConnectedPlaylists(req.keepUserId!);
    res.json({ data });
  } catch (error: any) {
    res.status(502).json({ error: 'library_playlists_failed', message: error?.message });
  }
}

async function tracksHandler(req: KeepAuthedRequest, res: Response) {
  const provider = req.params.provider as Provider;
  if (!validProvider(provider)) return void res.status(400).json({ error: 'provider_not_supported' });
  try {
    const data = await getConnectedPlaylistTracks(req.keepUserId!, provider, req.params.playlistId);
    res.json({ data });
  } catch (error: any) {
    res.status(502).json({ error: 'library_tracks_failed', message: error?.message });
  }
}

async function checkHandler(req: KeepAuthedRequest, res: Response) {
  const track = canonicalFromBody(req.body);
  if (!track) return void res.status(400).json({ error: 'title_and_artist_required' });
  try {
    const result = await findTrackAcrossConnectedPlaylists(req.keepUserId!, track);
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'library_check_failed', message: error?.message });
  }
}

async function addHandler(req: KeepAuthedRequest, res: Response) {
  const provider = String(req.body?.provider || '') as Provider;
  const playlistId = String(req.body?.playlistId || '').trim();
  const track = canonicalFromBody(req.body?.track);
  if (!validProvider(provider) || !playlistId || !track) {
    return void res.status(400).json({ error: 'provider_playlist_track_required' });
  }
  try {
    const result = await addTrackToConnectedPlaylist(req.keepUserId!, provider, playlistId, track);
    res.status(result.added ? 201 : 200).json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'library_add_failed', message: error?.message });
  }
}

async function importHandler(req: KeepAuthedRequest, res: Response) {
  const provider = req.params.provider as Provider;
  if (!validProvider(provider)) return void res.status(400).json({ error: 'provider_not_supported' });
  try {
    const result = await importConnectedSavedLibrary(req.keepUserId!, provider);
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'library_import_failed', message: error?.message });
  }
}

async function importedHandler(req: KeepAuthedRequest, res: Response) {
  try {
    const requested = Number(req.query.limit || 2000);
    const data = await listImportedMusicLibrary(req.keepUserId!, requested);
    res.json({ data });
  } catch (error: any) {
    res.status(502).json({ error: 'library_imported_list_failed', message: error?.message });
  }
}

async function visibilityHandler(req: KeepAuthedRequest, res: Response) {
  const visibility = String(req.body?.visibility || '').toUpperCase() as Visibility;
  if (!['PUBLIC', 'FOLLOWERS', 'PRIVATE'].includes(visibility)) {
    return void res.status(400).json({ error: 'invalid_visibility' });
  }
  try {
    const data = await setImportedMusicVisibility(req.keepUserId!, req.params.itemId, visibility);
    res.json({ data });
  } catch (error: any) {
    res.status(404).json({ error: 'library_item_update_failed', message: error?.message });
  }
}

async function syncHandler(req: KeepAuthedRequest, res: Response) {
  const provider = String(req.body?.provider || '') as Provider;
  const keepPlaylistId = String(req.body?.keepPlaylistId || '').trim();
  const providerPlaylistId = String(req.body?.providerPlaylistId || '').trim();
  if (!validProvider(provider) || !keepPlaylistId || !providerPlaylistId) {
    return void res.status(400).json({ error: 'provider_keep_playlist_destination_required' });
  }
  try {
    const result = await syncKeepPlaylistToConnectedProvider({
      profileId: req.keepUserId!,
      provider,
      keepPlaylistId,
      providerPlaylistId,
    });
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'library_sync_failed', message: error?.message });
  }
}

async function pendingSessionImportsHandler(req: KeepAuthedRequest, res: Response) {
  try {
    const data = await listPendingSessionImports(req.keepUserId!);
    res.json({ data });
  } catch (error: any) {
    res.status(502).json({ error: 'library_pending_imports_failed', message: error?.message });
  }
}

async function syncFavoritesWorkerHandler(req: Request, res: Response) {
  const authorized = await verifyFavoritesSyncWorkerKey(req);
  if (!authorized) return void res.status(401).json({ error: 'unauthorized' });
  try {
    const result = await syncFavoritesForAllConnectedProfiles();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'favorites_sync_worker_failed', message: error?.message });
  }
}

// Route worker enregistrée même sans `verifier` : la synchro auto Spotify<->
// Deezer ne dépend pas de la vérification JWT utilisateur, seulement du
// secret worker ci-dessus.
router.post('/library/sync-favorites-worker', syncFavoritesWorkerHandler);

if (verifier) {
  const guard = requireKeepAuth(verifier);
  router.get('/library/playlists', guard, playlistsHandler);
  router.get('/library/playlists/:provider/:playlistId/tracks', guard, tracksHandler);
  router.post('/library/check', guard, checkHandler);
  router.post('/library/add', guard, addHandler);
  router.post('/library/import/:provider', guard, importHandler);
  router.get('/library/imported', guard, importedHandler);
  router.get('/library/pending-session-imports', guard, pendingSessionImportsHandler);
  router.patch('/library/imported/:itemId/visibility', guard, visibilityHandler);
  router.post('/library/sync', guard, syncHandler);
} else {
  // sync-favorites-worker reste joignable (route déjà enregistrée plus haut,
  // avant ce bloc) même quand la vérification JWT utilisateur n'est pas
  // configurée -- elle ne dépend que du secret worker, pas de `verifier`.
  router.use('/library', (_req, res) => res.status(503).json({ error: 'auth_not_configured' }));
}

export default router;
