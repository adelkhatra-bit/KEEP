import { Router, Response } from 'express';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import {
  addTrackToConnectedPlaylist,
  findTrackAcrossConnectedPlaylists,
  getConnectedPlaylistTracks,
  importConnectedSavedLibrary,
  listConnectedPlaylists,
  listImportedMusicLibrary,
  setImportedMusicVisibility,
  syncKeepPlaylistToConnectedProvider,
} from '../lib/connectedMusicLibrary';

const router = Router();
const verifier = createSupabaseTokenVerifier();

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

if (verifier) {
  const guard = requireKeepAuth(verifier);
  router.get('/library/playlists', guard, playlistsHandler);
  router.get('/library/playlists/:provider/:playlistId/tracks', guard, tracksHandler);
  router.post('/library/check', guard, checkHandler);
  router.post('/library/add', guard, addHandler);
  router.post('/library/import/:provider', guard, importHandler);
  router.get('/library/imported', guard, importedHandler);
  router.patch('/library/imported/:itemId/visibility', guard, visibilityHandler);
  router.post('/library/sync', guard, syncHandler);
} else {
  router.use('/library', (_req, res) => res.status(503).json({ error: 'auth_not_configured' }));
}

export default router;
