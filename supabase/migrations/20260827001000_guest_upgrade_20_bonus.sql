-- KEEP — tunnel gratuit cohérent : 3 essais sans compte + 20 crédits après inscription.
-- Si les 3 essais ont déjà été consommés, le nouveau compte affiche donc
-- 20 crédits restants (23 au total depuis le premier lancement), jamais 23
-- nouveaux crédits après inscription.

update public.remote_config
set value = '20'::jsonb
where key = 'signup_bonus_successes';

create or replace function public.keep_import_guest_credit_usage(p_guest_consumed integer)
returns table(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  imported integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  guest_limit := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key='guest_success_limit'
    limit 1
  ), 3);

  imported := least(greatest(coalesce(p_guest_consumed, 0), 0), guest_limit);

  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, imported, now())
  on conflict(profile_id) do update
    set consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
        updated_at = now();

  return query select * from public.keep_download_credit_status();
end;
$$;

grant execute on function public.keep_import_guest_credit_usage(integer) to authenticated;
