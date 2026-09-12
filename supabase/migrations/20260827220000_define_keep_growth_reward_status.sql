create or replace function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  qualified_shares := 0;
  followers := 0;
  bonus_free_credits := 0;
  bonus_discovery_profiles := 0;
  bonus_sort_trials := 0;
  next_share_goal := 20;
  audience_pro_unlocked := false;
  audience_pro_threshold := 1000;
  return next;
end;
$$;

grant execute on function public.keep_growth_reward_status() to authenticated;
