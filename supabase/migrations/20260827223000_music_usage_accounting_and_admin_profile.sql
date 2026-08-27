-- KEEP — boucle comptable musique / profil / Super Admin.
-- Règle produit : une reconnaissance ou un PASS ne consomme aucun crédit.
-- Seul un GARDER issu de l'écoute de l'utilisateur consomme 1 crédit FREE.
-- Un morceau repris depuis le profil d'un autre utilisateur reste à 0 crédit.

-- Le profil KEEP doit disparaître avec le compte Auth. Certaines bases historiques
-- avaient perdu cette FK alors que 0001_core_identity.sql la prévoit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.profiles'::regclass
      AND c.confrelid = 'auth.users'::regclass
      AND c.contype = 'f'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_auth_users_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_id_auth_users_fkey;
  END IF;
END $$;

-- Les anciens builds pouvaient synchroniser une playlist sans écrire la décision
-- KEEP correspondante. On reconstruit uniquement les morceaux réellement présents
-- dans une playlist KEEP, en privé, sans inventer de morceau absent du compte.
INSERT INTO public.keep_decisions(
  profile_id, track_id, decision, recommended_playlist_id, chosen_playlist_id,
  was_correction, context, source_user_id, source_type, visibility, created_at
)
SELECT
  pl.owner_id,
  pt.track_id,
  'KEPT',
  NULL,
  pl.id,
  false,
  jsonb_build_object(
    'creditPolicy', 'LISTEN_KEEP',
    'source', 'legacy_playlist_backfill',
    'playlist', jsonb_build_object(
      'provider', coalesce(pl.provider, 'KEEP'),
      'providerPlaylistId', pl.provider_playlist_id,
      'name', pl.name
    )
  ),
  NULL,
  NULL,
  'PRIVATE',
  min(pt.added_at)
FROM public.playlists pl
JOIN public.playlist_tracks pt ON pt.playlist_id = pl.id
WHERE coalesce(pt.added_via, 'KEEP') = 'KEEP'
  AND NOT EXISTS (
    SELECT 1
    FROM public.keep_decisions kd
    WHERE kd.profile_id = pl.owner_id
      AND kd.track_id = pt.track_id
      AND kd.decision = 'KEPT'
  )
GROUP BY pl.owner_id, pt.track_id, pl.id, pl.provider, pl.provider_playlist_id, pl.name
ON CONFLICT DO NOTHING;

-- Nombre de KEEP qui doivent réellement débiter le quota :
-- 1) décisions LISTEN_KEEP/non sociales,
-- 2) ancien morceau de playlist KEEP qui n'est pas identifié comme copie sociale.
CREATE OR REPLACE FUNCTION public.keep_chargeable_keep_count(p_profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM (
    SELECT kd.track_id
    FROM public.keep_decisions kd
    WHERE kd.profile_id = p_profile_id
      AND kd.decision = 'KEPT'
      AND coalesce(kd.context->>'creditPolicy', 'LISTEN_KEEP') <> 'SOCIAL_ZERO_CREDIT'
      AND kd.source_user_id IS NULL
      AND coalesce(kd.source_type, '') <> 'profile'

    UNION

    SELECT pt.track_id
    FROM public.playlists pl
    JOIN public.playlist_tracks pt ON pt.playlist_id = pl.id
    WHERE pl.owner_id = p_profile_id
      AND coalesce(pt.added_via, 'KEEP') = 'KEEP'
      AND NOT EXISTS (
        SELECT 1
        FROM public.keep_decisions social
        WHERE social.profile_id = p_profile_id
          AND social.track_id = pt.track_id
          AND social.decision = 'KEPT'
          AND (
            social.context->>'creditPolicy' = 'SOCIAL_ZERO_CREDIT'
            OR social.source_user_id IS NOT NULL
            OR social.source_type = 'profile'
          )
      )
  ) chargeable;
$$;

CREATE OR REPLACE FUNCTION public.keep_social_keep_count(p_profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT kd.track_id)::integer
  FROM public.keep_decisions kd
  WHERE kd.profile_id = p_profile_id
    AND kd.decision = 'KEPT'
    AND (
      kd.context->>'creditPolicy' = 'SOCIAL_ZERO_CREDIT'
      OR kd.source_user_id IS NOT NULL
      OR kd.source_type = 'profile'
    );
$$;

REVOKE ALL ON FUNCTION public.keep_chargeable_keep_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.keep_social_keep_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_chargeable_keep_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.keep_social_keep_count(uuid) TO service_role;

-- Compteur ultra léger : on ne stocke aucun audio, seulement le nombre de
-- reconnaissances réussies par compte pour l'audit utilisateur/Super Admin.
CREATE TABLE IF NOT EXISTS public.music_usage_counters (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  recognized_count integer NOT NULL DEFAULT 0 CHECK (recognized_count >= 0),
  last_recognized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.music_usage_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.service_record_recognition_success(p_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count integer;
BEGIN
  IF p_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_profile_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.music_usage_counters(profile_id, recognized_count, last_recognized_at, updated_at)
  VALUES (p_profile_id, 1, now(), now())
  ON CONFLICT (profile_id) DO UPDATE
    SET recognized_count = public.music_usage_counters.recognized_count + 1,
        last_recognized_at = now(),
        updated_at = now()
  RETURNING recognized_count INTO next_count;

  RETURN next_count;
END;
$$;
REVOKE ALL ON FUNCTION public.service_record_recognition_success(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_record_recognition_success(uuid) TO service_role;

-- Le ledger reste le verrou de concurrence, mais il ne peut plus être inférieur
-- au nombre de morceaux réellement gardés. Cela répare notamment les comptes
-- historiques affichant encore FREE · 23 malgré des KEEP déjà présents.
INSERT INTO public.download_credit_usage(profile_id, consumed_count, updated_at)
SELECT p.id, public.keep_chargeable_keep_count(p.id), now()
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE coalesce(u.is_anonymous, false) = false
ON CONFLICT (profile_id) DO UPDATE
  SET consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
      updated_at = now();

-- Une reconnaissance historique exacte n'est pas reconstructible, mais chaque
-- KEEP débité prouve au minimum une reconnaissance. Le compteur démarre donc à
-- ce plancher sans fabriquer d'écoutes supplémentaires.
INSERT INTO public.music_usage_counters(profile_id, recognized_count, updated_at)
SELECT p.id, public.keep_chargeable_keep_count(p.id), now()
FROM public.profiles p
ON CONFLICT (profile_id) DO UPDATE
  SET recognized_count = greatest(public.music_usage_counters.recognized_count, excluded.recognized_count),
      updated_at = now();

CREATE OR REPLACE FUNCTION public.keep_download_credit_status()
RETURNS TABLE(
  plan_code text,
  is_anonymous boolean,
  consumed integer,
  credit_limit integer,
  remaining integer,
  unlimited boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 20;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  anon boolean := false;
  active_plan text := 'FREE';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  guest_limit := coalesce((
    SELECT (rc.value #>> '{}')::integer FROM public.remote_config rc
    WHERE rc.key = 'guest_success_limit' LIMIT 1
  ), 3);
  signup_bonus := coalesce((
    SELECT (rc.value #>> '{}')::integer FROM public.remote_config rc
    WHERE rc.key = 'signup_bonus_successes' LIMIT 1
  ), 20);

  anon := coalesce((SELECT u.is_anonymous FROM auth.users u WHERE u.id = uid), false);
  ledger_used := coalesce((SELECT d.consumed_count FROM public.download_credit_usage d WHERE d.profile_id = uid), 0);

  IF anon THEN
    used := ledger_used;
  ELSE
    derived_used := public.keep_chargeable_keep_count(uid);
    used := greatest(ledger_used, derived_used);
    IF used > ledger_used THEN
      INSERT INTO public.download_credit_usage(profile_id, consumed_count, updated_at)
      VALUES(uid, used, now())
      ON CONFLICT(profile_id) DO UPDATE
        SET consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
            updated_at = now();
    END IF;
  END IF;

  active_plan := coalesce((
    SELECT p.code::text
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.profile_id = uid
      AND s.status IN ('ACTIVE','TRIALING')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
    ORDER BY s.current_period_start DESC NULLS LAST, s.created_at DESC
    LIMIT 1
  ), 'FREE');

  plan_code := active_plan;
  is_anonymous := anon;
  consumed := used;
  unlimited := active_plan <> 'FREE';
  credit_limit := CASE WHEN unlimited THEN NULL WHEN anon THEN guest_limit ELSE guest_limit + signup_bonus END;
  remaining := CASE WHEN unlimited THEN NULL ELSE greatest(0, credit_limit - used) END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_download_credit_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_download_credit_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.keep_music_usage_status()
RETURNS TABLE(
  recognized_count integer,
  free_keeps_used integer,
  social_keeps integer,
  playlist_tracks integer,
  credit_limit integer,
  credit_remaining integer,
  plan_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  credit record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO credit FROM public.keep_download_credit_status();

  recognized_count := coalesce((SELECT m.recognized_count FROM public.music_usage_counters m WHERE m.profile_id = uid), 0);
  free_keeps_used := public.keep_chargeable_keep_count(uid);
  social_keeps := public.keep_social_keep_count(uid);
  playlist_tracks := coalesce((
    SELECT count(DISTINCT pt.track_id)::integer
    FROM public.playlists pl
    JOIN public.playlist_tracks pt ON pt.playlist_id = pl.id
    WHERE pl.owner_id = uid
  ), 0);
  credit_limit := credit.credit_limit;
  credit_remaining := credit.remaining;
  plan_code := credit.plan_code;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.keep_music_usage_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_music_usage_status() TO authenticated;

-- Annuaire Super Admin : une seule lecture donne identité + avatar + plan +
-- écoute + KEEP débités + copies sociales + solde FREE + bibliothèque.
DROP FUNCTION IF EXISTS public.admin_user_directory();
CREATE FUNCTION public.admin_user_directory()
RETURNS TABLE(
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  username text,
  display_name text,
  support_number bigint,
  country_code char(2),
  kind text,
  created_at timestamptz,
  plan_code text,
  keeps_this_month bigint,
  avatar_url text,
  free_keeps_used integer,
  social_keeps integer,
  credit_consumed integer,
  credit_limit integer,
  credit_remaining integer,
  playlist_tracks integer,
  recognized_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  guest_limit integer := 3;
  signup_bonus integer := 20;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.id = auth.uid() AND a.is_active = true
  ) THEN
    RAISE EXCEPTION 'admin_required' USING errcode = '42501';
  END IF;

  guest_limit := coalesce((SELECT (value #>> '{}')::integer FROM public.remote_config WHERE key='guest_success_limit' LIMIT 1), 3);
  signup_bonus := coalesce((SELECT (value #>> '{}')::integer FROM public.remote_config WHERE key='signup_bonus_successes' LIMIT 1), 20);

  RETURN QUERY
  SELECT
    p.id,
    CASE WHEN u.email LIKE '%@keep.local' THEN NULL ELSE u.email::text END,
    CASE WHEN u.email LIKE '%@keep.local' THEN NULL ELSE u.email_confirmed_at END,
    p.username::text,
    p.display_name::text,
    p.support_number,
    p.country_code,
    p.kind::text,
    p.created_at,
    coalesce(active_plan.code, 'FREE')::text,
    coalesce(monthly.keeps, 0)::bigint,
    p.avatar_url::text,
    public.keep_chargeable_keep_count(p.id),
    public.keep_social_keep_count(p.id),
    greatest(coalesce(d.consumed_count, 0), public.keep_chargeable_keep_count(p.id)),
    CASE WHEN coalesce(active_plan.code, 'FREE')::text = 'FREE' THEN guest_limit + signup_bonus ELSE NULL END,
    CASE WHEN coalesce(active_plan.code, 'FREE')::text = 'FREE'
      THEN greatest(0, guest_limit + signup_bonus - greatest(coalesce(d.consumed_count, 0), public.keep_chargeable_keep_count(p.id)))
      ELSE NULL END,
    coalesce(library.track_count, 0),
    coalesce(mu.recognized_count, 0)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN LATERAL (
    SELECT pl.code::text AS code
    FROM public.subscriptions s
    JOIN public.plans pl ON pl.id = s.plan_id
    WHERE s.profile_id = p.id
      AND s.status IN ('ACTIVE','TRIALING')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
    ORDER BY s.current_period_start DESC NULLS LAST, s.created_at DESC
    LIMIT 1
  ) active_plan ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS keeps
    FROM public.keep_decisions kd
    WHERE kd.profile_id = p.id
      AND kd.decision = 'KEPT'
      AND kd.created_at >= date_trunc('month', now())
  ) monthly ON true
  LEFT JOIN public.download_credit_usage d ON d.profile_id = p.id
  LEFT JOIN public.music_usage_counters mu ON mu.profile_id = p.id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT pt.track_id)::integer AS track_count
    FROM public.playlists pl
    JOIN public.playlist_tracks pt ON pt.playlist_id = pl.id
    WHERE pl.owner_id = p.id
  ) library ON true
  ORDER BY p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_user_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_directory() TO authenticated;
