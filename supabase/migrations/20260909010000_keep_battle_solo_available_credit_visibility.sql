-- Adel (09/09/2026) : "j'ai envoye une invite a un utilisateur qui n'a pas
-- assez de fruits [Free], pourquoi il est visible ?" -- la liste "Joueurs
-- disponibles" ne renvoyait aucune info de credit, impossible de savoir
-- avant de defier (le serveur rejette deja correctement l'invite cote
-- keep_battle_challenge_send/keep_battle_arena_challenge avec
-- BATTLE_TARGET_NO_CREDIT, mais seulement APRES avoir cree le salon). On
-- expose le credit ici pour que le client puisse avertir avant meme de
-- taper "BATTLE", sans creer d'arene pour rien.
drop function if exists public.keep_battle_solo_available(integer);
create or replace function public.keep_battle_solo_available(p_limit integer default 12)
returns table(profile_id uuid, username text, avatar_url text, theme_code text, last_seen_at timestamptz, skill_tier text, preferred_theme_codes text[], preferred_round_count integer, remaining_free integer, has_paid_access boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select sp.profile_id, p.username, p.avatar_url, sp.theme_code, sp.last_seen_at, public.keep_battle_skill_tier(sp.profile_id),
    coalesce(mp.theme_codes, array['MIX']), coalesce(mp.round_count, 8),
    public.keep_theoretical_free_credit_remaining_for_profile(sp.profile_id),
    public.keep_profile_has_paid_battle_access(sp.profile_id)
  from public.keep_battle_solo_presence sp
  join public.profiles p on p.id = sp.profile_id
  left join public.keep_battle_match_preferences mp on mp.profile_id = sp.profile_id
  where sp.profile_id <> auth.uid()
    and (
      (sp.status='AVAILABLE' and sp.last_seen_at > now() - interval '20 seconds')
      or (sp.manual_available = true and sp.last_seen_at > now() - interval '30 minutes')
    )
  order by sp.last_seen_at desc
  limit greatest(1, p_limit);
$function$;
grant execute on function public.keep_battle_solo_available(integer) to anon, authenticated;
