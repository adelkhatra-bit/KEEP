-- Adel (02/09/2026) : "si des utilisateurs jouent seul, il faut que les
-- utilisateurs [disponibles] reçoivent une notification en leur disant qu'il
-- y a des utilisateurs qui cherchent à faire un Battle, connectez-vous" --
-- prévient les joueurs qui se sont mis "disponible" qu'une partie solo
-- vient de démarrer, une seule fois par session (pas à chaque battement de
-- 650ms) et au plus une fois toutes les 10 minutes par joueur solo pour
-- éviter le spam.
alter table public.keep_battle_solo_presence add column if not exists last_broadcast_at timestamptz;

create or replace function public.keep_battle_solo_heartbeat(p_theme_code text default 'MIX'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_theme text := upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
  prev record;
  notified integer := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme := 'MIX'; end if;

  select status, last_seen_at, last_broadcast_at into prev from public.keep_battle_solo_presence where profile_id=uid;

  insert into public.keep_battle_solo_presence(profile_id,theme_code,status,last_seen_at)
  values(uid,v_theme,'AVAILABLE',now())
  on conflict(profile_id) do update set theme_code=excluded.theme_code,status='AVAILABLE',last_seen_at=now();

  if (prev.status is distinct from 'AVAILABLE' or prev.last_seen_at is null or prev.last_seen_at < now() - interval '20 seconds')
     and (prev.last_broadcast_at is null or prev.last_broadcast_at < now() - interval '10 minutes') then
    insert into public.notifications(profile_id,type,title,body,data)
    select p.id,'BATTLE_PLAYER_AVAILABLE','⚡ Un joueur cherche un Battle',format('@%s joue en solo sur %s. Rejoins-le !',(select coalesce(nullif(username,''),'KEEP') from public.profiles where id=uid),v_theme),jsonb_build_object('themeCode',v_theme)
    from public.keep_battle_solo_presence sp join public.profiles p on p.id=sp.profile_id
    where sp.profile_id<>uid and sp.manual_available=true and sp.last_seen_at>now()-interval '30 minutes'
    limit 20;
    get diagnostics notified = row_count;
    if notified>0 then
      update public.keep_battle_solo_presence set last_broadcast_at=now() where profile_id=uid;
    end if;
  end if;
end;
$function$;
