create function public.keep_growth_reward_status(
  out qualified_shares integer,
  out followers integer,
  out bonus_free_credits integer,
  out bonus_discovery_profiles integer,
  out bonus_sort_trials integer,
  out next_share_goal integer,
  out audience_pro_unlocked boolean,
  out audience_pro_threshold integer
)
language plpgsql
as $$
begin
  qualified_shares := 0;
  followers := 0;
  bonus_free_credits := 0;
  bonus_discovery_profiles := 0;
  bonus_sort_trials := 0;
  next_share_goal := 20;
  audience_pro_unlocked := false;
  audience_pro_threshold := 1000;
end;
$$;

grant execute on function public.keep_growth_reward_status() to authenticated;
