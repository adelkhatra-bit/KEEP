import { Router, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';

const router = Router();
const verifier = createSupabaseTokenVerifier();

type Provider = 'spotify' | 'deezer';

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function stateSecret(): string | null {
  return process.env.MUSIC_OAUTH_STATE_SECRET || null;
}

function signState(payload: object): string {
  const secret = stateSecret();
  if (!secret) throw new Error('MUSIC_OAUTH_STATE_SECRET manquant');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(value: string): { userId: string; provider: Provider; exp: number } | null {
  const secret = stateSecret();
  if (!secret) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!data?.userId || !data?.provider || !data?.exp || Date.now() > data.exp) return null;
  return data;
}

function backendBaseUrl(req: KeepAuthedRequest): string {
  return process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
}

function providerConfigured(provider: Provider): boolean {
  if (provider === 'spotify') return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  return Boolean(process.env.DEEZER_APP_ID && process.env.DEEZER_APP_SECRET);
}

async function upsertConnection(args: {
  userId: string;
  provider: Provider;
  providerUserId?: string;
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
}) {
  const db = serviceClient();
  if (!db) throw new Error('Supabase service role non configuré');
  const expiresAt = args.expiresIn ? new Date(Date.now() + args.expiresIn * 1000).toISOString() : null;
  const { error } = await db.from('music_provider_connections').upsert({
    profile_id: args.userId,
    provider: args.provider,
    provider_user_id: args.providerUserId || null,
    access_token: args.accessToken,
    refresh_token: args.refreshToken || null,
    token_type: args.tokenType || 'Bearer',
    scope: args.scope || null,
    expires_at: expiresAt,
  }, { onConflict: 'profile_id,provider' });
  if (error) throw error;
}

async function statusHandler(req: KeepAuthedRequest, res: Response) {
  const db = serviceClient();
  if (!db) return res.status(503).json({ error: 'supabase_service_not_configured' });
  const { data, error } = await db
    .from('music_provider_connections')
    .select('provider,provider_user_id,connected_at,expires_at')
    .eq('profile_id', req.keepUserId!);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({
    providers: {
      apple_music: { configured: Boolean(process.env.APPLE_MUSICKIT_TEAM_ID), connected: false, connection: null },
      spotify: { configured: providerConfigured('spotify'), connected: data?.some((x) => x.provider === 'spotify') ?? false, connection: data?.find((x) => x.provider === 'spotify') ?? null },
      deezer: { configured: providerConfigured('deezer'), connected: data?.some((x) => x.provider === 'deezer') ?? false, connection: data?.find((x) => x.provider === 'deezer') ?? null },
      youtube_music: { configured: false, connected: false, connection: null },
      soundcloud: { configured: false, connected: false, connection: null },
      tidal: { configured: false, connected: false, connection: null },
    },
  });
}

async function startHandler(req: KeepAuthedRequest, res: Response) {
  const provider = req.params.provider as Provider;
  if (!['spotify', 'deezer'].includes(provider)) return res.status(404).json({ error: 'provider_not_supported' });
  if (!providerConfigured(provider)) return res.status(501).json({ error: `${provider}_not_configured` });

  const state = signState({ userId: req.keepUserId, provider, exp: Date.now() + 10 * 60 * 1000 });
  const callback = `${backendBaseUrl(req)}/api/music/connections/callback/${provider}`;

  if (provider === 'spotify') {
    const query = new URLSearchParams({
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: callback,
      state,
      scope: 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read',
      show_dialog: 'false',
    });
    return res.redirect(`https://accounts.spotify.com/authorize?${query.toString()}`);
  }

  const query = new URLSearchParams({
    app_id: process.env.DEEZER_APP_ID!,
    redirect_uri: callback,
    perms: 'basic_access,email,manage_library,delete_library,listening_history',
    state,
  });
  return res.redirect(`https://connect.deezer.com/oauth/auth.php?${query.toString()}`);
}

async function callbackHandler(req: KeepAuthedRequest, res: Response) {
  const provider = req.params.provider as Provider;
  const state = verifyState(String(req.query.state || ''));
  if (!state || state.provider !== provider) return res.status(400).send('KEEP: état OAuth invalide ou expiré.');
  const code = String(req.query.code || '');
  if (!code) return res.redirect('keep://music-connections?error=access_denied');
  const callback = `${backendBaseUrl(req)}/api/music/connections/callback/${provider}`;

  try {
    if (provider === 'spotify') {
      const body = new URLSearchParams({ code, redirect_uri: callback, grant_type: 'authorization_code' });
      const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
      const tokenRes = await axios.post('https://accounts.spotify.com/api/token', body.toString(), {
        headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
      });
      const profileRes = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });
      await upsertConnection({
        userId: state.userId,
        provider,
        providerUserId: profileRes.data.id,
        accessToken: tokenRes.data.access_token,
        refreshToken: tokenRes.data.refresh_token,
        tokenType: tokenRes.data.token_type,
        scope: tokenRes.data.scope,
        expiresIn: tokenRes.data.expires_in,
      });
    } else {
      const tokenUrl = 'https://connect.deezer.com/oauth/access_token.php';
      const tokenRes = await axios.get(tokenUrl, {
        params: {
          app_id: process.env.DEEZER_APP_ID,
          secret: process.env.DEEZER_APP_SECRET,
          code,
          output: 'json',
        },
      });
      const token = tokenRes.data.access_token;
      const profileRes = await axios.get('https://api.deezer.com/user/me', { params: { access_token: token } });
      await upsertConnection({
        userId: state.userId,
        provider,
        providerUserId: String(profileRes.data.id),
        accessToken: token,
        expiresIn: Number(tokenRes.data.expires || 0) || undefined,
      });
    }
    return res.redirect(`keep://music-connections?provider=${provider}&connected=1`);
  } catch (error: any) {
    const detail = encodeURIComponent(error?.response?.data?.error?.message || error?.message || 'oauth_failed');
    return res.redirect(`keep://music-connections?provider=${provider}&error=${detail}`);
  }
}

async function disconnectHandler(req: KeepAuthedRequest, res: Response) {
  const provider = req.params.provider as Provider;
  const db = serviceClient();
  if (!db) return res.status(503).json({ error: 'supabase_service_not_configured' });
  const { error } = await db.from('music_provider_connections').delete().eq('profile_id', req.keepUserId!).eq('provider', provider);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

if (verifier) {
  router.get('/connections/status', requireKeepAuth(verifier), statusHandler);
  router.get('/connections/start/:provider', requireKeepAuth(verifier), startHandler);
  router.delete('/connections/:provider', requireKeepAuth(verifier), disconnectHandler);
} else {
  router.get('/connections/status', (_req, res) => res.status(503).json({ error: 'auth_not_configured' }));
  router.get('/connections/start/:provider', (_req, res) => res.status(503).json({ error: 'auth_not_configured' }));
  router.delete('/connections/:provider', (_req, res) => res.status(503).json({ error: 'auth_not_configured' }));
}
router.get('/connections/callback/:provider', callbackHandler);

export default router;
