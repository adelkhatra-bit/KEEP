-- Battle availability must mean "actually inviteable" for the selected format.
-- Keep the call backward compatible: p_round_count defaults to the historical 8.
create or replace function public.keep_battle_solo_available(
  p_limit integer default 12,
  p_round_count integer default 8
)
returns table(
  profile_id uuid,
  username text,
  avatar_url text,
  theme_code text,
  last_seen_at timestamptz,
  skill_tier text,
  preferred_theme_codes text[],
  preferred_round_count integer,
  remaining_free integer,
  has_paid_access boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with eligible as (
    select
      sp.profile_id,
      p.username,
      p.avatar_url,
      sp.theme_code,
      sp.last_seen_at,
      public.keep_battle_skill_tier(sp.profile_id) as skill_tier,
      coalesce(mp.theme_codes, array['MIX']) as preferred_theme_codes,
      coalesce(mp.round_count, 8) as preferred_round_count,
      public.keep_theoretical_free_credit_remaining_for_profile(sp.profile_id) as remaining_free,
      public.keep_profile_has_paid_battle_access(sp.profile_id) as has_paid_access
    from public.keep_battle_solo_presence sp
    join public.profiles p on p.id = sp.profile_id
    left join public.keep_battle_match_preferences mp on mp.profile_id = sp.profile_id
    where sp.profile_id <> auth.uid()
      and p.discovery_hidden = false
      and (
        (sp.status='AVAILABLE' and sp.last_seen_at > now() - interval '20 seconds')
        or (sp.manual_available = true and sp.last_seen_at > now() - interval '30 minutes')
      )
  )
  select
    e.profile_id,e.username,e.avatar_url,e.theme_code,e.last_seen_at,e.skill_tier,
    e.preferred_theme_codes,e.preferred_round_count,e.remaining_free,e.has_paid_access
  from eligible e
  where e.has_paid_access = true
     or e.remaining_free >= public.keep_battle_stake_for_rounds(greatest(5,least(coalesce(p_round_count,8),30)))
  order by e.last_seen_at desc
  limit greatest(1,p_limit);
$function$;
