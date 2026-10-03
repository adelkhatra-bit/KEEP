-- Battle multijoueur équitable : l'hôte n'impose plus son style.
-- Chaque joueur ACTIVE apporte exactement un style issu de SES préférences.
-- Ses préférences tournent d'une revanche à l'autre ; le moteur existant
-- alterne ensuite les thèmes retenus dans les manches.

create or replace function public.keep_battle_arena_fair_theme_codes(
  p_arena_id uuid,
  p_match_no integer
)
returns text[]
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with members as (
    select
      m.profile_id,
      row_number() over(order by m.joined_at,m.profile_id)::integer as member_ord,
      coalesce(
        (
          select array_agg(x.code order by x.ord)
          from (
            select upper(trim(code)) as code,min(ord)::integer as ord
            from unnest(coalesce(pref.theme_codes,array[]::text[])) with ordinality u(code,ord)
            where upper(trim(coalesce(code,''))) not in ('','MIX')
              and exists(
                select 1 from public.keep_battle_themes t
                where t.code=upper(trim(code)) and t.enabled=true
              )
            group by upper(trim(code))
          ) x
        ),
        array[]::text[]
      ) as prefs
    from public.keep_battle_arena_members m
    left join public.keep_battle_match_preferences pref on pref.profile_id=m.profile_id
    where m.arena_id=p_arena_id
      and m.seat_status='ACTIVE'
  ),
  picked as (
    select
      member_ord,
      case
        when cardinality(prefs)>0 then
          prefs[
            (
              (
                greatest(coalesce(p_match_no,1),1)-1
                + member_ord-1
              ) % cardinality(prefs)
            ) + 1
          ]
        else null
      end as code
    from members
  ),
  firsts as (
    select code,min(member_ord) as first_ord
    from picked
    where code is not null
    group by code
  )
  select case when count(*)=0 then null else array_agg(code order by first_ord) end
  from firsts;
$function$;

revoke all on function public.keep_battle_arena_fair_theme_codes(uuid,integer)
from public,anon,authenticated;

do $migration$
declare
  ddl text;
  marker text := $marker$
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
$marker$;
  insertion text := $insert$

  -- Équité multi : le serveur recalcule les styles à partir des joueurs
  -- réellement présents AVANT chaque génération de manches.
  a.theme_codes := public.keep_battle_arena_fair_theme_codes(a.id,p_match_no);
  if a.theme_codes is null or cardinality(a.theme_codes)=0 then
    a.theme_code := 'MIX';
    a.theme_codes := null;
  else
    a.theme_code := a.theme_codes[1];
  end if;

  update public.keep_battle_arenas
  set theme_code=a.theme_code,
      theme_codes=a.theme_codes,
      updated_at=now()
  where id=a.id;
$insert$;
  pos integer;
begin
  select pg_get_functiondef('public.keep_battle_arena_seed_rounds(uuid,integer)'::regprocedure) into ddl;

  if strpos(ddl,'keep_battle_arena_fair_theme_codes')>0 then
    return;
  end if;

  pos := strpos(ddl,marker);
  if pos=0 then raise exception 'FAIR_THEME_SEED_ANCHOR_NOT_FOUND'; end if;
  pos := pos + length(marker);

  ddl := substring(ddl from 1 for pos-1) || insertion || substring(ddl from pos);
  execute ddl;
end;
$migration$;
