-- Adel (04/09/2026) : "pour un téléchargement, pour mettre une musique sur
-- le profil, je peux débiter ... tout ce qui est censé avoir du prix, je
-- veux pouvoir le modifier" -- le Battle a déjà son prix réglable
-- (battle_arena_stake_free_credits, Remote Config). Il manquait le prix du
-- Keep (toujours 1 Free en dur, jamais configurable). Nouvelle clé
-- free_cost_per_keep (defaut 1, deja visible/modifiable dans Remote Config
-- des qu'elle existe) : garder un morceau consomme desormais ce montant au
-- lieu d'un "+1" fige dans le code.
insert into public.remote_config(key, value, description)
values ('free_cost_per_keep', '1'::jsonb, 'Free débités à chaque morceau gardé sur le profil (FREE/Premium uniquement -- Creator Pro/Venue Pro restent illimités).')
on conflict (key) do nothing;

create or replace function public.keep_consume_download_credit()
returns table(allowed boolean, plan_code text, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  st record;
  used integer := 0;
  day_key text := to_char(current_date,'YYYY-MM-DD');
  cost integer := 1;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  cost := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1), 1));
  select * into st from public.keep_download_credit_status();

  if st.unlimited then
    allowed := true;
    plan_code := st.plan_code;
    consumed := st.consumed;
    credit_limit := null;
    remaining := null;
    unlimited := true;
    return next;
    return;
  end if;

  if st.plan_code = 'PREMIUM' then
    insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
    values(uid,'DOWNLOAD',day_key,0,now())
    on conflict(profile_id,feature_key,period_key) do nothing;

    select used_count into used from public.feature_usage_counters
    where profile_id=uid and feature_key='DOWNLOAD' and period_key=day_key
    for update;

    if used >= coalesce(st.credit_limit,0) then
      allowed := false;
      plan_code := st.plan_code;
      consumed := used;
      credit_limit := st.credit_limit;
      remaining := 0;
      unlimited := false;
      return next;
      return;
    end if;

    used := used + cost;
    update public.feature_usage_counters
    set used_count=used,updated_at=now()
    where profile_id=uid and feature_key='DOWNLOAD' and period_key=day_key;

    allowed := true;
    plan_code := st.plan_code;
    consumed := used;
    credit_limit := st.credit_limit;
    remaining := greatest(0,st.credit_limit-used);
    unlimited := false;
    return next;
    return;
  end if;

  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, 0, now())
  on conflict(profile_id) do nothing;

  select d.consumed_count into used
  from public.download_credit_usage d
  where d.profile_id = uid
  for update;

  select * into st from public.keep_download_credit_status();
  if used >= coalesce(st.credit_limit,0) then
    allowed := false;
    plan_code := st.plan_code;
    consumed := used;
    credit_limit := st.credit_limit;
    remaining := 0;
    unlimited := false;
    return next;
    return;
  end if;

  used := used + cost;
  update public.download_credit_usage
  set consumed_count=used,updated_at=now()
  where profile_id=uid;

  allowed := true;
  plan_code := st.plan_code;
  consumed := used;
  credit_limit := st.credit_limit;
  remaining := greatest(0,st.credit_limit-used);
  unlimited := false;
  return next;
end;
$function$;
