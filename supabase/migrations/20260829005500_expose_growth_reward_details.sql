create or replace function public.keep_commercial_rules()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'free_discovery_profiles', coalesce(public.keep_plan_limit('FREE','discovery_profiles_lifetime'),3),
    'premium_smart_sort_trials', coalesce(public.keep_plan_limit('PREMIUM','smart_sort_trials_lifetime'),3),
    'premium_daily_downloads', coalesce(public.keep_plan_limit('PREMIUM','downloads_per_day'),40),
    'share_daily_cap', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_daily_cap' limit 1),10),
    'share_tiers', jsonb_build_array(
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier1_threshold' limit 1),20),
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier2_threshold' limit 1),50),
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier3_threshold' limit 1),100)
    ),
    'follower_tiers', jsonb_build_array(
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier1_threshold' limit 1),25),
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier2_threshold' limit 1),100),
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold' limit 1),250),
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier4_threshold' limit 1),500),
      coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold' limit 1),1000)
    ),
    'follower_rewards', jsonb_build_object(
      'tier1_discovery', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_25_discovery' limit 1),3),
      'tier2_sort', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_100_sort' limit 1),1),
      'tier3_credits', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits' limit 1),5),
      'tier4_discovery', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_discovery' limit 1),5),
      'tier4_sort', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_sort' limit 1),1),
      'tier5_credits', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits' limit 1),20)
    ),
    'share_rewards', jsonb_build_object(
      'tier1_discovery', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_20' limit 1),3),
      'tier2_credits', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_50' limit 1),5),
      'tier3_credits', coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_100' limit 1),20),
      'tier3_sort', 1
    )
  );
$function$;
