-- Adel (12/09/2026) : "il faut masquer les utilisateurs test" -- "Joueurs
-- disponibles" (keep_battle_solo_available, utilisée par l'écran BATTLE EN
-- LIGNE et par l'invitation à rejoindre une arène de groupe) affichait aussi
-- les comptes internes/test. KEEP a déjà un mécanisme dédié pour ça :
-- profiles.discovery_hidden (Super Admin -> Visibilité Découvertes), déjà
-- posé automatiquement à true pour les comptes admin actifs (voir migration
-- 20260827230000). On réutilise cette même colonne au lieu d'inventer un
-- second flag : un compte masqué de Découvertes est aussi masqué des
-- listes de matchmaking Battle, sans toucher à son compte, ses données ou
-- son lien de profil public.
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
    and p.discovery_hidden = false
    and (
      (sp.status='AVAILABLE' and sp.last_seen_at > now() - interval '20 seconds')
      or (sp.manual_available = true and sp.last_seen_at > now() - interval '30 minutes')
    )
  order by sp.last_seen_at desc
  limit greatest(1, p_limit);
$function$;
grant execute on function public.keep_battle_solo_available(integer) to anon, authenticated;
