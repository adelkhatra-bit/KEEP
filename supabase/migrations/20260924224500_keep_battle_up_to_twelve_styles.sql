-- 24/09/2026 — aligne "Mes styles Battle" avec le profil musical réel.
-- L'ancienne limite arbitraire de 3 masquait une partie de l'univers musical.
-- On garde une borne UI/DB raisonnable de 12 styles précis ; MIX reste exclusif.

alter table public.keep_battle_match_preferences
  drop constraint if exists keep_battle_match_preferences_max_three_styles;

alter table public.keep_battle_match_preferences
  drop constraint if exists keep_battle_match_preferences_max_twelve_styles;

alter table public.keep_battle_match_preferences
  add constraint keep_battle_match_preferences_max_twelve_styles
  check (
    cardinality(theme_codes) between 1 and 12
    and (not ('MIX' = any(theme_codes)) or theme_codes = array['MIX']::text[])
  );

create or replace function public.keep_battle_save_match_preferences(
  p_theme_codes text[],
  p_round_count integer default 8
)
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
    limit 12
  ) chosen;

  if v_codes is null or cardinality(v_codes) = 0 then
    v_codes := array['MIX'];
  end if;

  if exists (
    select 1
    from unnest(v_codes) code
    where code <> 'MIX'
      and not exists (
        select 1 from public.keep_battle_themes t
        where t.code = code and t.enabled = true
      )
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

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
