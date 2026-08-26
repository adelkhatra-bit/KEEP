-- KEEP — corrige le solde d'un nouveau compte FREE.
-- Avant ce correctif, l'absence de ligne dans download_credit_usage faisait
-- tomber `used` à NULL et le RPC renvoyait remaining=0 malgré une limite de 7.
-- Règle produit : 3 crédits d'essai local + 4 crédits offerts après inscription
-- = 7 crédits disponibles pour un compte FREE nouvellement vérifié.

create or replace function public.keep_download_credit_status()
returns table(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 4;
  used integer := 0;
  anon boolean := false;
  active_plan text := 'FREE';
begin
  if uid is null then raise exception 'authentication_required'; end if;

  guest_limit := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key='guest_success_limit'
    limit 1
  ), 3);

  signup_bonus := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key='signup_bonus_successes'
    limit 1
  ), 4);

  anon := coalesce((select u.is_anonymous from auth.users u where u.id=uid), false);
  used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid), 0);

  active_plan := coalesce((
    select p.code::text
    from public.subscriptions s
    join public.plans p on p.id=s.plan_id
    where s.profile_id=uid and s.status in ('ACTIVE','TRIALING')
    order by s.created_at desc
    limit 1
  ), 'FREE');

  plan_code := active_plan;
  is_anonymous := anon;
  consumed := used;
  unlimited := active_plan <> 'FREE';
  credit_limit := case when unlimited then null when anon then guest_limit else guest_limit + signup_bonus end;
  remaining := case when unlimited then null else greatest(0, credit_limit - used) end;
  return next;
end;
$$;

grant execute on function public.keep_download_credit_status() to authenticated;
