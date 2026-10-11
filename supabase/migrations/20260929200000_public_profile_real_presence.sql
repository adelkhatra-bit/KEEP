-- Adel (29/09/2026) : « je visite un autre utilisateur, il est à côté de moi
-- sur l'appli, et son profil affiche Hors ligne ».
--
-- Audit (3 défauts cumulés) :
-- 1. keep_public_profile_presence était SECURITY INVOKER alors que
--    keep_battle_solo_presence a la RLS activée et tous ses droits retirés à
--    anon/authenticated (20260829094020) : un visiteur ne pouvait JAMAIS lire
--    la ligne d'un autre profil -> l'appli retombait sur « Hors ligne ».
-- 2. Depuis 20260929025000, is_online renvoyait le réglage Battle ON/OFF
--    (manual_available) au lieu de la présence réelle.
-- 3. keep_battle_manual_availability_ping ne rafraîchissait l'activité que si
--    Battle était sur ON : un utilisateur Battle OFF n'était jamais « vu ».
--
-- Correctif :
-- - nouvelle colonne app_last_seen_at = activité dans l'appli, distincte de
--   last_seen_at qui pilote la liste Battle (status SOLO/AVAILABLE < 30 s,
--   manual_available < 30 min) : pinguer la présence d'un joueur Battle OFF
--   ne doit JAMAIS le faire apparaître comme adversaire disponible ;
-- - présence publique = activité dans les 5 dernières minutes (l'appli pingue
--   toutes les 4 min + à chaque retour au premier plan), lisible par un
--   visiteur via une fonction SECURITY DEFINER qui n'expose QUE la date et un
--   booléen pour UN profil. La disponibilité Battle reste inchangée.

alter table public.keep_battle_solo_presence
  add column if not exists app_last_seen_at timestamptz;

create or replace function public.keep_public_profile_presence(p_profile_id uuid)
returns table(last_seen_at timestamptz, is_online boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    greatest(sp.app_last_seen_at, sp.last_seen_at) as last_seen_at,
    coalesce(greatest(sp.app_last_seen_at, sp.last_seen_at) > now() - interval '5 minutes', false) as is_online
  from public.keep_battle_solo_presence sp
  where sp.profile_id = p_profile_id
  limit 1;
$$;

revoke all on function public.keep_public_profile_presence(uuid) from public;
grant execute on function public.keep_public_profile_presence(uuid) to anon, authenticated;

-- Même ping qu'avant pour Battle (last_seen_at seulement si Battle ON), plus
-- la présence appli pour TOUT utilisateur connecté. manual_available n'est
-- jamais modifié ; une ligne manquante (compte très ancien) est créée avec le
-- même défaut que l'inscription (cf. 20260929011500).
create or replace function public.keep_battle_manual_availability_ping()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.keep_battle_solo_presence(profile_id, theme_code, status, manual_available, last_seen_at, app_last_seen_at)
  values (uid, 'MIX', 'SOLO', true, now(), now())
  on conflict (profile_id) do update set
    app_last_seen_at = now(),
    last_seen_at = case when keep_battle_solo_presence.manual_available then now() else keep_battle_solo_presence.last_seen_at end;
end;
$function$;
