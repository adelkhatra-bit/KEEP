import { Router, Response } from 'express';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { supabaseUserClient, isSupabaseUserClientConfigured } from '../lib/supabaseUserClient';

/**
 * Routes sociales KEEP -- profils publics + Follow/Unfollow. Réécrit le
 * 23/08/2026 contre le VRAI schéma (supabase/migrations/0001_core_identity.sql
 * + 0006_rls.sql, appliqué en prod ce même jour) -- l'ancien fichier était
 * écrit contre un schéma inventé, jamais réellement déployé (voir
 * historique -- 3 tables vides supprimées avant d'appliquer le vrai schéma).
 *
 * NE DÉPEND PLUS DE service_role (toujours non configuré) : chaque requête
 * utilise le jeton de l'utilisateur courant (voir supabaseUserClient.ts),
 * les policies RLS de 0006_rls.sql couvrent déjà exactement ce dont ces
 * routes ont besoin (profil propre ou public en lecture, propriétaire
 * uniquement en écriture ; follows lisibles par tous, écrits par le
 * follower uniquement) -- pas de bypass RLS nécessaire ici.
 *
 * Le vrai `profiles` n'a PAS de colonnes follower_count/following_count
 * (calculées à la volée ci-dessous) ni de flags de visibilité par section
 * (visible_playlists, etc. -- concept jamais migré, un profil est public ou
 * privé dans son ensemble via `is_public`, voir profiles_select_own_or_public).
 */
const router = Router();
const tokenVerifier = createSupabaseTokenVerifier();
const CONFIGURED = !!tokenVerifier && isSupabaseUserClientConfigured();

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  city: string | null;
  country_code: string | null;
  kind: string;
  is_public: boolean;
}

async function withCounts(client: ReturnType<typeof supabaseUserClient>, profile: ProfileRow) {
  const [followers, following] = await Promise.all([
    client.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', profile.id),
    client.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', profile.id),
  ]);
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    bio: profile.bio,
    avatarUrl: profile.avatar_url,
    city: profile.city,
    countryCode: profile.country_code,
    kind: profile.kind,
    isPublic: profile.is_public,
    followerCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
  };
}

if (!CONFIGURED) {
  router.use((_req, res) => {
    res.status(503).json({
      error: 'social_backend_not_configured',
      message: 'Backend social non configuré (SUPABASE_URL / SUPABASE_ANON_KEY manquants).',
    });
  });
} else {
  const auth = requireKeepAuth(tokenVerifier!);

  // ---- PROFIL PUBLIC (URL partageable) ----
  router.get('/profiles/:username', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    // RLS (profiles_select_own_or_public) filtre déjà : si le profil est
    // privé et que ce n'est pas le sien, la ligne n'est simplement pas
    // renvoyée -- 404 honnête, jamais un 403 qui confirmerait l'existence
    // d'un profil privé à un visiteur.
    const { data, error } = await client.from('profiles').select('*').ilike('username', req.params.username).maybeSingle();
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    if (!data) return void res.status(404).json({ error: 'not_found', message: 'Profil introuvable.' });
    res.json({ data: await withCounts(client, data as ProfileRow) });
  });

  // ---- MON PROFIL ----
  router.get('/me', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { data, error } = await client.from('profiles').select('*').eq('id', req.keepUserId).maybeSingle();
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    if (!data) return void res.status(404).json({ error: 'not_found', message: 'Profil pas encore créé.' });
    res.json({ data: await withCounts(client, data as ProfileRow) });
  });

  router.patch('/me', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const allowed = ['username', 'display_name', 'bio', 'avatar_url', 'city', 'country_code', 'kind', 'is_public', 'location_opt_in'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) if (key in req.body) patch[key] = req.body[key];
    patch.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from('profiles')
      .upsert({ id: req.keepUserId, ...patch }, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) return void res.status(400).json({ error: 'update_failed', message: error.message });
    res.json({ data: await withCounts(client, data as ProfileRow) });
  });

  // ---- FOLLOW / UNFOLLOW ----
  router.post('/follows/:userId', auth, async (req: KeepAuthedRequest, res: Response) => {
    if (req.params.userId === req.keepUserId) {
      return void res.status(400).json({ error: 'self_follow', message: 'Impossible de se suivre soi-même.' });
    }
    const client = supabaseUserClient(req.keepAccessToken!);
    const { error } = await client
      .from('follows')
      .upsert({ follower_id: req.keepUserId, followee_id: req.params.userId }, { onConflict: 'follower_id,followee_id' });
    if (error) return void res.status(400).json({ error: 'follow_failed', message: error.message });
    res.status(204).end();
  });

  router.delete('/follows/:userId', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { error } = await client.from('follows').delete().match({ follower_id: req.keepUserId, followee_id: req.params.userId });
    if (error) return void res.status(400).json({ error: 'unfollow_failed', message: error.message });
    res.status(204).end();
  });

  router.get('/me/followers', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { data, error } = await client
      .from('follows')
      .select('follower_id, profiles!follows_follower_id_fkey(id,username,avatar_url)')
      .eq('followee_id', req.keepUserId);
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });

  router.get('/me/following', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { data, error } = await client
      .from('follows')
      .select('followee_id, profiles!follows_followee_id_fkey(id,username,avatar_url)')
      .eq('follower_id', req.keepUserId);
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });
}

export default router;
