import { Router, Response } from 'express';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { supabaseUserClient, isSupabaseUserClientConfigured } from '../lib/supabaseUserClient';
import { findOrCreateTrack } from '../lib/keepLocalIndexStore';

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

/**
 * Réseaux sociaux + infos privées (cf. demande explicite du 24/08/2026 --
 * boutons de redirection réseaux sociaux sur le profil, date de
 * naissance/genre facultatifs et privés). Tables réelles déjà migrées
 * (0001_core_identity.sql, RLS 0006_rls.sql) mais jamais lues/écrites par
 * aucune route jusqu'ici -- ajouté ici plutôt qu'un nouveau fichier, même
 * pattern RLS-only (jamais service_role) que le reste de ce fichier.
 */
async function fetchSocialLinks(client: ReturnType<typeof supabaseUserClient>, profileId: string, ownerView: boolean) {
  let query = client.from('social_links').select('platform, url, visibility').eq('profile_id', profileId);
  if (!ownerView) query = query.eq('visibility', 'PUBLIC');
  const { data } = await query;
  return data ?? [];
}

/**
 * Cf. demande explicite du 24/08/2026 -- "les 3 découvertes Guest doivent
 * automatiquement appartenir au nouveau compte, aucune perte". Solution
 * choisie : plutôt qu'un script de MIGRATION après inscription (fragile,
 * un état de plus à tester), les KEEP d'un invité s'écrivent RÉELLEMENT
 * dans Supabase dès le premier tap, avec le même auth.uid() que celui que
 * l'inscription (email) conservera ensuite (comportement officiel Supabase
 * Auth déjà exploité pour le quota, voir routes/recognition.ts) -- donc
 * rien à transférer : la ligne appartient déjà au bon id depuis le début.
 *
 * `keep_decisions.profile_id` référence `profiles(id)` -- un pur invité n'a
 * pourtant pas forcément de ligne `profiles` (jamais visité l'écran Profil).
 * On en crée une minimale à la volée, jamais un blocage sur "pas encore de
 * profil" pour une action aussi basique que GARDER un morceau.
 */
async function ensureProfileExists(client: ReturnType<typeof supabaseUserClient>, userId: string): Promise<void> {
  const { data } = await client.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (data) return;
  const { error } = await client
    .from('profiles')
    .insert({ id: userId, username: `guest-${userId.slice(0, 8)}` })
    .select('id')
    .maybeSingle();
  // 23505 = déjà créée entre-temps par une requête concurrente -- pas une vraie erreur.
  if (error && (error as any).code !== '23505') throw new Error(`ensureProfileExists: ${error.message}`);
}

async function withCounts(client: ReturnType<typeof supabaseUserClient>, profile: ProfileRow, ownerView: boolean) {
  const [followers, following, socialLinks] = await Promise.all([
    client.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', profile.id),
    client.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', profile.id),
    fetchSocialLinks(client, profile.id, ownerView),
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
    socialLinks,
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
    res.json({ data: await withCounts(client, data as ProfileRow, req.keepUserId === data.id) });
  });

  // ---- MON PROFIL ----
  router.get('/me', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { data, error } = await client.from('profiles').select('*').eq('id', req.keepUserId).maybeSingle();
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    if (!data) return void res.status(404).json({ error: 'not_found', message: 'Profil pas encore créé.' });
    const [profile, privateInfo] = await Promise.all([
      withCounts(client, data as ProfileRow, true),
      client.from('profile_private_info').select('birth_date, gender').eq('profile_id', req.keepUserId).maybeSingle(),
    ]);
    res.json({ data: { ...profile, birthDate: privateInfo.data?.birth_date ?? null, gender: privateInfo.data?.gender ?? null } });
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
    res.json({ data: await withCounts(client, data as ProfileRow, true) });
  });

  /**
   * Date de naissance/genre -- toujours facultatifs, jamais publics (table
   * séparée, RLS `profile_private_info_owner` -- own-row uniquement, cf.
   * audit sécurité du 23/08/2026 confirmant cette policy).
   */
  router.patch('/me/private-info', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const allowed = ['birth_date', 'gender'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) if (key in req.body) patch[key] = req.body[key];
    const { error } = await client.from('profile_private_info').upsert({ profile_id: req.keepUserId, ...patch }, { onConflict: 'profile_id' });
    if (error) return void res.status(400).json({ error: 'update_failed', message: error.message });
    res.status(204).end();
  });

  /**
   * Réseaux sociaux -- remplacement complet à chaque sauvegarde (delete+insert
   * dans une seule requête logique) plutôt qu'un patch incrémental : l'écran
   * Profil envoie toujours la liste complète voulue par l'utilisateur, plus
   * simple et sans état intermédiaire incohérent possible.
   */
  router.put('/me/social-links', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const links = Array.isArray(req.body.links) ? req.body.links : [];
    const del = await client.from('social_links').delete().eq('profile_id', req.keepUserId);
    if (del.error) return void res.status(400).json({ error: 'update_failed', message: del.error.message });
    if (links.length > 0) {
      const rows = links.map((l: { platform: string; url: string; visibility: string }) => ({
        profile_id: req.keepUserId, platform: l.platform, url: l.url, visibility: l.visibility,
      }));
      const ins = await client.from('social_links').insert(rows);
      if (ins.error) return void res.status(400).json({ error: 'update_failed', message: ins.error.message });
    }
    res.status(204).end();
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

  /**
   * LIKE (cf. demande explicite du 24/08/2026 -- "LIKE ≠ KEEP : LIKE = j'aime
   * ce morceau, KEEP = je le récupère dans mon univers musical"). Table
   * `track_likes` (migration 0015), recherchée absente avant création comme
   * demandé. Idempotent -- upsert, jamais un doublon si l'utilisateur retape.
   */
  router.post('/tracks/:trackId/like', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { error } = await client
      .from('track_likes')
      .upsert({ profile_id: req.keepUserId, track_id: req.params.trackId }, { onConflict: 'profile_id,track_id' });
    if (error) return void res.status(400).json({ error: 'like_failed', message: error.message });
    res.status(204).end();
  });

  router.delete('/tracks/:trackId/like', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { error } = await client.from('track_likes').delete().match({ profile_id: req.keepUserId, track_id: req.params.trackId });
    if (error) return void res.status(400).json({ error: 'unlike_failed', message: error.message });
    res.status(204).end();
  });

  /** Nombre réel de likes + si MOI je like déjà (pour l'état du cœur côté UI, jamais un compteur inventé). */
  router.get('/tracks/:trackId/likes', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const [count, mine] = await Promise.all([
      client.from('track_likes').select('profile_id', { count: 'exact', head: true }).eq('track_id', req.params.trackId),
      client.from('track_likes').select('profile_id').eq('track_id', req.params.trackId).eq('profile_id', req.keepUserId).maybeSingle(),
    ]);
    res.json({ data: { likeCount: count.count ?? 0, likedByMe: !!mine.data } });
  });

  /**
   * GARDER/PASSER réel (cf. demande explicite du 24/08/2026) -- écrit dans
   * `keep_decisions` en utilisant TOUJOURS le jeton courant, invité inclus
   * (voir ensureProfileExists ci-dessus pour pourquoi ça fonctionne sans
   * blocage). Résout/crée le morceau canonique via findOrCreateTrack --
   * même fonction que le KEEP Local Index, jamais un doublon de logique.
   */
  router.post('/me/keeps', auth, async (req: KeepAuthedRequest, res: Response) => {
    const { title, artist, album, isrc, artworkUrl, decision, sourceUserId, sourceType, visibility } = req.body as {
      title?: string; artist?: string; album?: string; isrc?: string; artworkUrl?: string; decision?: 'KEPT' | 'PASSED';
      /** Cf. demande explicite du 24/08/2026 -- provenance : "Découvert via @adel" quand ce KEEP vient du profil d'un autre utilisateur. */
      sourceUserId?: string; sourceType?: 'profile' | 'share_link'; visibility?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
    };
    if (!title || !artist || (decision !== 'KEPT' && decision !== 'PASSED')) {
      return void res.status(400).json({ error: 'invalid_body', message: 'title, artist et decision (KEPT|PASSED) requis.' });
    }
    const client = supabaseUserClient(req.keepAccessToken!);
    try {
      await ensureProfileExists(client, req.keepUserId!);
      const track = await findOrCreateTrack(req.keepAccessToken!, { title, artist, album, isrc, artworkUrl });
      const { data, error } = await client
        .from('keep_decisions')
        .insert({
          profile_id: req.keepUserId,
          track_id: track.id,
          decision,
          source_user_id: sourceUserId ?? null,
          source_type: sourceUserId ? (sourceType ?? 'profile') : null,
          // Cf. demande explicite du 24/08/2026 -- "la préférence par défaut
          // doit être clairement définie" : PUBLIC par défaut pour un KEEP
          // normal (cohérent avec is_public du profil, l'utilisateur choisit
          // déjà d'avoir un profil public ou non) -- explicitement PAS
          // "PRIVATE par défaut" ici, ça c'est la règle pour l'historique
          // IMPORTÉ (Spotify/etc., pas encore branché, voir section 5/6).
          visibility: visibility ?? 'PUBLIC',
        })
        .select('id, created_at, visibility')
        .single();
      if (error) return void res.status(400).json({ error: 'keep_failed', message: error.message });
      res.status(201).json({ data: { id: data.id, trackId: track.id, decision, createdAt: data.created_at, visibility: data.visibility } });
    } catch (e: any) {
      res.status(500).json({ error: 'keep_failed', message: e?.message });
    }
  });

  /** "Mes KEEP" réel (cf. demande explicite du 24/08/2026) -- source de vérité serveur, plus seulement l'AsyncStorage locale de cet appareil. Toujours TOUT montrer au propriétaire (visibilité = ce que les AUTRES voient, jamais une restriction sur soi-même). */
  router.get('/me/keeps', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { data, error } = await client
      .from('keep_decisions')
      .select('id, decision, created_at, visibility, source_user_id, source_type, tracks(id, title, artist, album, artwork_url, isrc, provider_ids)')
      .eq('profile_id', req.keepUserId)
      .eq('decision', 'KEPT')
      .order('created_at', { ascending: false });
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });

  /** Morceaux PUBLIC d'un profil visité (cf. demande explicite -- "B voit les morceaux PUBLIC de A"). FOLLOWERS non géré ici volontairement (nécessiterait de vérifier le lien follow, laissé pour un incrément futur -- PUBLIC uniquement pour l'instant, jamais PRIVATE/FOLLOWERS fuités). */
  router.get('/profiles/:username/keeps', auth, async (req: KeepAuthedRequest, res: Response) => {
    const client = supabaseUserClient(req.keepAccessToken!);
    const { data: profile } = await client.from('profiles').select('id').ilike('username', req.params.username).maybeSingle();
    if (!profile) return void res.status(404).json({ error: 'not_found' });
    const { data, error } = await client
      .from('keep_decisions')
      .select('id, created_at, tracks(id, title, artist, album, artwork_url, isrc, provider_ids)')
      .eq('profile_id', profile.id)
      .eq('decision', 'KEPT')
      .eq('visibility', 'PUBLIC')
      .order('created_at', { ascending: false });
    if (error) return void res.status(500).json({ error: 'query_failed', message: error.message });
    res.json({ data });
  });

  /** Masquer/republier un morceau de mon profil (cf. demande explicite -- "reste dans la bibliothèque personnelle, juste masqué du profil"). Jamais un DELETE -- la ligne keep_decisions reste, seule la visibilité change. */
  router.patch('/me/keeps/:id/visibility', auth, async (req: KeepAuthedRequest, res: Response) => {
    const { visibility } = req.body as { visibility?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' };
    if (!visibility || !['PUBLIC', 'FOLLOWERS', 'PRIVATE'].includes(visibility)) {
      return void res.status(400).json({ error: 'invalid_body', message: 'visibility (PUBLIC|FOLLOWERS|PRIVATE) requis.' });
    }
    const client = supabaseUserClient(req.keepAccessToken!);
    const { error } = await client.from('keep_decisions').update({ visibility }).eq('id', req.params.id).eq('profile_id', req.keepUserId);
    if (error) return void res.status(400).json({ error: 'update_failed', message: error.message });
    res.status(204).end();
  });
}

export default router;
