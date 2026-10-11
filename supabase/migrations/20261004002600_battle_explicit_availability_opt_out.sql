alter table public.keep_battle_solo_presence
  add column if not exists availability_opt_out boolean not null default false;

-- Les anciens OFF pouvaient être écrits automatiquement à la sortie d'un
-- Battle. Ils ne prouvent donc pas un choix explicite : rétablir ON une fois.
update public.keep_battle_solo_presence
set manual_available = true,
    availability_opt_out = false,
    last_seen_at = now()
where manual_available = false;

create or replace function public.keep_battle_set_manual_available(
  p_available boolean,
  p_theme_code text default 'MIX'::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_theme text := upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then
    v_theme := 'MIX';
  end if;

  insert into public.keep_battle_solo_presence(
    profile_id,theme_code,status,manual_available,availability_opt_out,last_seen_at,app_last_seen_at
  )
  values(uid,v_theme,'SOLO',p_available,not p_available,now(),now())
  on conflict(profile_id) do update set
    manual_available = p_available,
    availability_opt_out = not p_available,
    status = case when p_available then keep_battle_solo_presence.status else 'SOLO' end,
    theme_code = case when p_available then v_theme else keep_battle_solo_presence.theme_code end,
    last_seen_at = case when p_available then now() else keep_battle_solo_presence.last_seen_at end,
    app_last_seen_at = now();
end;
$function$;

create or replace function public.keep_battle_manual_availability_ping()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.keep_battle_solo_presence(
    profile_id, theme_code, status, manual_available, availability_opt_out, last_seen_at, app_last_seen_at
  )
  values (uid, 'MIX', 'SOLO', true, false, now(), now())
  on conflict (profile_id) do update set
    app_last_seen_at = now(),
    manual_available = case
      when keep_battle_solo_presence.availability_opt_out then false
      else true
    end,
    last_seen_at = case
      when keep_battle_solo_presence.availability_opt_out then keep_battle_solo_presence.last_seen_at
      else now()
    end;
end;
$function$;
