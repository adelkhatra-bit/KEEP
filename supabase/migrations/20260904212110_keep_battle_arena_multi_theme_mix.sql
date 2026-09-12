-- Adel (04/09/2026) : "si j'ai sélectionné cinq [styles] ... il faut qu'il
-- me mette un peu de tout, un mix de tout, il faut pas uniquement de la
-- funk" -- côté solo, keep_battle_solo_pack mixe déjà correctement TOUS les
-- styles acceptés via theme_codes (voir 20260903200000). Côté arène
-- (invites), la colonne theme_code est un TEXTE UNIQUE : impossible de
-- représenter "mixe Funk+Raï+Rap FR+Reggae+RnB" avec une seule valeur.
-- Ajoute theme_codes (tableau, nullable) sur keep_battle_arenas : quand
-- rempli, il remplace le filtre par thème unique pour le tirage des
-- morceaux, EXACTEMENT comme côté solo. theme_code reste l'étiquette
-- d'affichage (premier style réel), rien d'autre ne change.
alter table public.keep_battle_arenas add column if not exists theme_codes text[];

create or replace function public.keep_battle_arena_create(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8, p_theme_codes text[] DEFAULT NULL::text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
  theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
  themes text[];
  min_free integer:=3;
  notified integer:=0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
  if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;

  select nullif(array_agg(distinct u.code), array[]::text[]) into themes
  from (select upper(trim(x)) as code from unnest(coalesce(p_theme_codes, array[]::text[])) x) u(code)
  where u.code <> '' and u.code <> 'MIX';

  if themes is not null and exists (
    select 1 from unnest(themes) c
    where not exists (select 1 from public.keep_battle_themes t where t.code = c and t.enabled = true)
  ) then themes := null; end if;

  if themes is not null then
    theme := themes[1];
  elsif not exists(select 1 from public.keep_battle_themes where code=theme and enabled=true) then
    theme:='MIX';
  end if;

  insert into public.keep_battle_arenas(host_id,theme_code,theme_codes,round_count,max_players) values(uid,theme,themes,greatest(5,least(coalesce(p_round_count,8),30)),10) returning * into a;
  insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,'ACTIVE');
  if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
  perform public.keep_battle_arena_seed_rounds(a.id,1);
  begin notified := public.keep_battle_notify_followers(a.id); exception when others then notified := 0; end;
  return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'themeCodes',to_jsonb(a.theme_codes),'status',a.status,'players',1,'maxPlayers',10,'queue',0,'matchNo',1,'stakeFree',min_free,'followersNotified',notified);
end;
$function$;
