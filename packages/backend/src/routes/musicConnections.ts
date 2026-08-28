import { Router, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { getIntegrationSecret } from '../lib/integrationSecrets';

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

async function credentials(provider: Provider) {
  if (provider === 'spotify') {
    const [id, secret] = await Promise.all([
      getIntegrationSecret('SPOTIFY_CLIENT_ID'),
      getIntegrationSecret('SPOTIFY_CLIENT_SECRET'),
    ]);
    return { id, secret };
  }
  const [id, secret] = await Promise.all([
    getIntegrationSecret('DEEZER_APP_ID'),
    getIntegrationSecret('DEEZER_APP_SECRET'),
  ]);
  return { id, secret };
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
  const database = serviceClient();
  if (!database) throw new Error('Supabase service role non configuré');
  const expiresAt = args.expiresIn ? new Date(Date.now() + args.expiresIn * 1000).toISOString() : null;
  const { error } = await database.from('music_provider_connections').upsert({
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
  const database = serviceClient();
  if (!database) return res.status(503).json({ error: 'supabase_service_not_configured' });
  const [{ id: spotifyId, secret: spotifySecret }, { id: deezerId, secret: deezerSecret }] = await Promise.all([
    credentials('spotify'),
    credentials('deezer'),
  ]);
  const { data, error } = await database
    .from('music_provider_connections')
    .select('provider,provider_user_id,connected_at,expires_at')
    .eq('profile_id', req.keepUserId!);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({
    providers: {
      apple_music: { configured: Boolean(await getIntegrationSecret('APPLE_MUSICKIT_TEAM_ID')), connected: false, connection: null },
      spotify: { configured: Boolean(spotifyId && spotifySecret), connected: data?.some((x) => x.provider === 'spotify') ?? false, connection: data?.find((x) => x.provider === 'spotify') ?? null },
      deezer: { configured: Boolean(deezerId && deezerSecret), connected: data?.some((x) => x.provider === 'deezer') ?? false, connection: data?.find((x) => x.provider === 'deezer') ?? null },
      youtube_music: { configured: false, connected: false, connection: null },
      soundcloud: { configured: false, connected: false, connection: null },
      tidal: { configured: false, connected: false, connection: null },
    },
  });
}

function wantsJson(req: KeepAuthedRequest): boolean {
  return String(req.query.response || '').toLowerCase() === 'json' || req.accepts(['json', 'html']) === 'json';
}

function sendAuthorization(req: KeepAuthedRequest, res: Response, provider: Provider, authorizationUrl: string) {
  if (wantsJson(req)) {
    return res.json({
      provider,
      authorizationUrl,
      expiresInSeconds: 600,
      callbackScheme: 'keep://music-connections',
    });
  }
  return res.redirect(authorizationUrl);
}

async function startHandler(req: KeepAuthedRequest, res: Response) {
  const provider = req.params.provider as Provider;
  if (!['spotify', 'deezer'].includes(provider)) return res.status(404).json({ error: 'provider_not_supported' });
  const { id, secret } = await credentials(provider);
  if (!id || !secret) return res.status(501).json({ error: `${provider}_not_configured` });

  const state = signState({ userId: req.keepUserId, provider, exp: Date.now() + 10 * 60 * 1000 });
  const callback = `${backendBaseUrl(req)}/api/music/connections/callback/${provider}`;

  if (provider === 'spotify') {
    const query = new URLSearchParams({
      client_id: id,
      response_type: 'code',
      redirect_uri: callback,
      state,
      scope: 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-library-modify',
      show_dialog: 'false',
    });
    return sendAuthorization(req, res, provider, `https://accounts.spotify.com/authorize?${query.toString()}`);
  }

  const query = new URLSearchParams({
    app_id: id,
    redirect_uri: callback,
    perms: 'basic_access,email,manage_library,delete_library,listening_history',
    state,
  });
  return sendAuthorization(req, res, provider, `https://connect.deezer.com/oauth/auth.php?${query.toString()}`);
}

async function callbackHandler(req: KeepAuthedRequest, res: Response) {
  const provider = req.params.provider as Provider;
  const state = verifyState(String(req.query.state || ''));
  if (!state || state.provider !== provider) return res.status(400).send('KEEP: état OAuth invalide ou expiré.');
  const code = String(req.query.code || '');
  if (!code) return res.redirect('keep://music-connections?error=access_denied');
  const callback = `${backendBaseUrl(req)}/api/music/connections/callback/${provider}`;

  try {
    const { id, secret } = await credentials(provider);
    if (!id || !secret) throw new Error(`${provider} non configuré`);

    if (provider === 'spotify') {
      const body = new URLSearchParams({ code, redirect_uri: callback, grant_type: 'authorization_code' });
      const auth = Buffer.from(`${id}:${secret}`).toString('base64');
      const tokenRes = await axios.post('https://accounts.spotify.com/api/token', body.toString(), {
        headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
        timeout: 15000,
      });
      const profileRes = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
        timeout: 15000,
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
      const tokenRes = await axios.get('https://connect.deezer.com/oauth/access_token.php', {
        params: { app_id: id, secret, code, output: 'json' },
        timeout: 15000,
      });
      const token = tokenRes.data.access_token;
      const profileRes = await axios.get('https://api.deezer.com/user/me', { params: { access_token: token }, timeout: 15000 });
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
  const database = serviceClient();
  if (!database) return res.status(503).json({ error: 'supabase_service_not_configured' });
  const { error } = await database.from('music_provider_connections').delete().eq('profile_id', req.keepUserId!).eq('provider', provider);
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
