-- Même règle côté serveur que dans l'interface : au maximum trois styles
-- précis, et MIX est exclusif. Une ancienne préférence trop longue est
-- normalisée sans supprimer le compte ni ses autres réglages.
update public.keep_battle_match_preferences p
set theme_codes = coalesce((
      select array_agg(chosen.code order by chosen.first_ord)
      from (
        select upper(trim(code)) as code, min(ord) as first_ord
        from unnest(coalesce(p.theme_codes, array['MIX']::text[])) with ordinality u(code, ord)
        where upper(trim(coalesce(code, ''))) not in ('', 'MIX')
        group by upper(trim(code))
        order by min(ord)
        limit 3
      ) chosen
    ), array['MIX']::text[]),
    updated_at = now();

alter table public.keep_battle_match_preferences
  drop constraint if exists keep_battle_match_preferences_max_three_styles;
alter table public.keep_battle_match_preferences
  add constraint keep_battle_match_preferences_max_three_styles
  check (
    cardinality(theme_codes) between 1 and 3
    and (not ('MIX' = any(theme_codes)) or theme_codes = array['MIX']::text[])
  );

create or replace function public.keep_battle_save_match_preferences(p_theme_codes text[], p_round_count integer default 8)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_codes text[];
  v_round integer := greatest(5, least(coalesce(p_round_count, 8), 30));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select array_agg(code order by first_ord) into v_codes
  from (
    select upper(trim(code)) as code, min(ord) as first_ord
    from unnest(coalesce(p_theme_codes, array['MIX']::text[])) with ordinality u(code, ord)
    where upper(trim(coalesce(code, ''))) not in ('', 'MIX')
    group by upper(trim(code))
    order by min(ord)
    limit 3
  ) chosen;
  if v_codes is null or cardinality(v_codes) = 0 then v_codes := array['MIX']; end if;

  if exists (
    select 1 from unnest(v_codes) code
    where code <> 'MIX'
      and not exists (select 1 from public.keep_battle_themes t where t.code = code and t.enabled = true)
  ) then raise exception 'BATTLE_THEME_UNAVAILABLE'; end if;

  insert into public.keep_battle_match_preferences(profile_id, theme_codes, round_count, updated_at)
  values(uid, v_codes, v_round, now())
  on conflict(profile_id) do update
    set theme_codes = excluded.theme_codes,
        round_count = excluded.round_count,
        updated_at = now();
  return jsonb_build_object('themeCodes', to_jsonb(v_codes), 'roundCount', v_round);
end;
$function$;

revoke all on function public.keep_battle_save_match_preferences(text[], integer) from public, anon;
grant execute on function public.keep_battle_save_match_preferences(text[], integer) to authenticated;
