-- KEEP Battle Solo — quota engagé uniquement au premier audio réellement lancé.
-- 30/09/2026 : "samedi" avait 10 starts mais 0 Solo terminé.
-- La préparation d'un pack ne doit jamais consommer de quota.
--
-- session_tokens est conservé sur la ligne quotidienne existante : au plus
-- quelques tokens par profil/jour, sans nouvelle table à croissance massive.

alter table public.keep_battle_solo_daily_usage
  add column if not exists session_tokens text[] not null default '{}'::text[];

create or replace function public.keep_battle_solo_consume_daily_start(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  v_token text := trim(coalesce(p_session_token, ''));
  v_limit integer;
  v_starts integer;
  v_plan text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(v_token) < 8 or char_length(v_token) > 160 then
    raise exception 'BATTLE_SOLO_SESSION_TOKEN_INVALID';
  end if;

  v_plan := public.keep_active_plan_code(uid);
  v_limit := public.keep_battle_solo_daily_limit_for_profile(uid);

  insert into public.keep_battle_solo_daily_usage(profile_id, usage_date, starts, updated_at, session_tokens)
  values (uid, current_date, 1, now(), array[v_token])
  on conflict (profile_id, usage_date) do update
    set starts = public.keep_battle_solo_daily_usage.starts
                 + case when v_token = any(public.keep_battle_solo_daily_usage.session_tokens) then 0 else 1 end,
        session_tokens = case
          when v_token = any(public.keep_battle_solo_daily_usage.session_tokens)
            then public.keep_battle_solo_daily_usage.session_tokens
          else array_append(public.keep_battle_solo_daily_usage.session_tokens, v_token)
        end,
        updated_at = now()
    where v_token = any(public.keep_battle_solo_daily_usage.session_tokens)
       or public.keep_battle_solo_daily_usage.starts < v_limit
  returning starts into v_starts;

  if v_starts is null then
    raise exception 'BATTLE_SOLO_DAILY_LIMIT_REACHED:%', v_limit;
  end if;

  return jsonb_build_object(
    'used', v_starts,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_starts),
    'unlimited', false,
    'plan', v_plan,
    'resetsAt', (current_date + 1)::timestamptz
  );
end;
$function$;

revoke all on function public.keep_battle_solo_consume_daily_start(text) from public, anon;
grant execute on function public.keep_battle_solo_consume_daily_start(text) to authenticated, service_role;

-- Compatibilité anciens bundles : ils appelaient l'overload sans argument
-- pendant la préparation du pack. Cet appel devient lecture seule pour ne
-- plus brûler des Solos sans musique réellement lancée.
create or replace function public.keep_battle_solo_consume_daily_start()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  return public.keep_battle_solo_daily_status();
end;
$function$;

revoke all on function public.keep_battle_solo_consume_daily_start() from public, anon;
grant execute on function public.keep_battle_solo_consume_daily_start() to authenticated, service_role;

-- Pendant la transition, un ancien client qui termine réellement une partie
-- doit quand même être reflété dans le quota. On monte le compteur au minimum
-- au nombre de parties terminées du jour, sans jamais le diminuer.
create or replace function public.keep_battle_solo_reconcile_daily_usage_after_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_completed integer;
begin
  select count(*)::integer into v_completed
  from public.keep_battle_solo_history h
  where h.profile_id = new.profile_id
    and h.completed_at >= date_trunc('day', new.completed_at)
    and h.completed_at < date_trunc('day', new.completed_at) + interval '1 day';

  insert into public.keep_battle_solo_daily_usage(profile_id, usage_date, starts, updated_at)
  values (new.profile_id, new.completed_at::date, greatest(1, v_completed), now())
  on conflict (profile_id, usage_date) do update
    set starts = greatest(public.keep_battle_solo_daily_usage.starts, excluded.starts),
        updated_at = now();

  return new;
end;
$function$;

drop trigger if exists trg_keep_battle_solo_reconcile_daily_usage_after_completion
  on public.keep_battle_solo_history;
create trigger trg_keep_battle_solo_reconcile_daily_usage_after_completion
after insert on public.keep_battle_solo_history
for each row execute function public.keep_battle_solo_reconcile_daily_usage_after_completion();

revoke all on function public.keep_battle_solo_reconcile_daily_usage_after_completion() from public, anon, authenticated;
