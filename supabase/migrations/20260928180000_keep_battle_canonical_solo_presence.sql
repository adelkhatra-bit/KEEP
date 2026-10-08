-- Canonical SOLO presence: one heartbeat signature, real round progress.
drop function if exists public.keep_battle_solo_heartbeat(text);

create or replace function public.keep_battle_solo_heartbeat(
  p_theme_code text default 'MIX'::text,
  p_round_index integer default null,
  p_round_total integer default null
) returns void
language plpgsql
security definer
set search_path='public'
as $f$
declare
  uid uuid:=auth.uid();
  v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
  insert into public.keep_battle_solo_presence(profile_id,theme_code,status,last_seen_at,solo_round_index,solo_round_total)
  values(uid,v_theme,'SOLO',now(),greatest(0,coalesce(p_round_index,0)),greatest(1,coalesce(p_round_total,1)))
  on conflict(profile_id) do update
    set theme_code=excluded.theme_code,status='SOLO',last_seen_at=now(),
        solo_round_index=excluded.solo_round_index,solo_round_total=excluded.solo_round_total;
end $f$;

revoke all on function public.keep_battle_solo_heartbeat(text,integer,integer) from public,anon;
grant execute on function public.keep_battle_solo_heartbeat(text,integer,integer) to authenticated;
