-- Fonctions manquantes : keep_qualified_share_count et keep_growth_reward_status
-- Ces fonctions sont appelées par les migrations 20260828174500 et 20260829002000
-- mais n'étaient jamais définie, causant des erreurs de migration.

create or replace function public.keep_qualified_share_count(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$ select 0; $$;

grant execute on function public.keep_qualified_share_count(uuid) to authenticated;

create or replace function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language sql
stable
security definer
set search_path to 'public'
as $$ select 0::integer, 0::integer, 0::integer, 0::integer, 0::integer, 20::integer, false, 1000::integer; $$;

grant execute on function public.keep_growth_reward_status() to authenticated;
