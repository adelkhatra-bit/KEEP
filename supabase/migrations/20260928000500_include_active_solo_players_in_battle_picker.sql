-- Active Solo players must stay visible in the multiplayer picker so an invite
-- can be prepared without interrupting their current game.
create or replace function public.keep_battle_solo_available(p_limit integer default 12,p_round_count integer default 8)
returns table(profile_id uuid,username text,avatar_url text,theme_code text,last_seen_at timestamptz,skill_tier text,preferred_theme_codes text[],preferred_round_count integer,remaining_free integer,has_paid_access boolean,solo_round_index integer,solo_round_total integer,solo_round_remaining integer)
language sql stable security definer set search_path=public as $$
with eligible as (
 select sp.profile_id,p.username,p.avatar_url,sp.theme_code,sp.last_seen_at,public.keep_battle_skill_tier(sp.profile_id) skill_tier,
 coalesce(mp.theme_codes,array['MIX']) preferred_theme_codes,coalesce(mp.round_count,8) preferred_round_count,
 public.keep_theoretical_free_credit_remaining_for_profile(sp.profile_id) remaining_free,public.keep_profile_has_paid_battle_access(sp.profile_id) has_paid_access,
 sp.solo_round_index,sp.solo_round_total,
 case when sp.solo_round_total is not null then greatest(0,sp.solo_round_total-coalesce(sp.solo_round_index,0)) end solo_round_remaining
 from public.keep_battle_solo_presence sp join public.profiles p on p.id=sp.profile_id left join public.keep_battle_match_preferences mp on mp.profile_id=sp.profile_id
 where sp.profile_id<>auth.uid() and p.discovery_hidden=false
 and ((sp.status='SOLO' and sp.last_seen_at>now()-interval '30 seconds') or (sp.status='AVAILABLE' and sp.last_seen_at>now()-interval '30 seconds') or (sp.manual_available=true and sp.last_seen_at>now()-interval '30 minutes'))
)
select * from eligible e where e.has_paid_access=true or e.remaining_free>=public.keep_battle_stake_for_rounds(greatest(5,least(coalesce(p_round_count,8),30)))
order by e.last_seen_at desc limit greatest(1,p_limit)
$$;
