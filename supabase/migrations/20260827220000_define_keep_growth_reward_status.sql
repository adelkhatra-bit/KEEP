create function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language sql
as $$
  select 0::integer, 0::integer, 0::integer, 0::integer, 0::integer, 20::integer, false::boolean, 1000::integer;
$$;

grant execute on function public.keep_growth_reward_status() to authenticated;
