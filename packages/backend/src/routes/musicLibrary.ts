import { Router, Response } from 'express';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import {
  addTrackToConnectedPlaylist,
  findTrackAcrossConnectedPlaylists,
  getConnectedPlaylistTracks,
  listConnectedPlaylists,
} from '../lib/connectedMusicLibrary';

const router = Router();
const verifier = createSupabaseTokenVerifier();

type Provider = 'spotify' | 'deezer';

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
  if (!['spotify', 'deezer'].includes(provider)) return void res.status(400).json({ error: 'provider_not_supported' });
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
  if (!['spotify', 'deezer'].includes(provider) || !playlistId || !track) {
    return void res.status(400).json({ error: 'provider_playlist_track_required' });
  }
  try {
    const result = await addTrackToConnectedPlaylist(req.keepUserId!, provider, playlistId, track);
    res.status(result.added ? 201 : 200).json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'library_add_failed', message: error?.message });
  }
}

if (verifier) {
  const guard = requireKeepAuth(verifier);
  router.get('/library/playlists', guard, playlistsHandler);
  router.get('/library/playlists/:provider/:playlistId/tracks', guard, tracksHandler);
  router.post('/library/check', guard, checkHandler);
  router.post('/library/add', guard, addHandler);
} else {
  router.use('/library', (_req, res) => res.status(503).json({ error: 'auth_not_configured' }));
}

export default router;
