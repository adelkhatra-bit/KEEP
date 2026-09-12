-- Adel (02/09/2026) : "trouve une solution sur le profil disponible ou pas
-- disponible ... un utilisateur qui se connecte à la plateforme peut se
-- rendre disponible même s'il est pas en train de faire des Battle ...
-- recevra des notifications pour des Battle, hormis s'il a enlevé la
-- notification." Aujourd'hui keep_battle_solo_presence.status='AVAILABLE'
-- n'est posé QUE par le heartbeat de la partie solo active (TTL 20s) --
-- impossible d'être "visible pour un Battle" sans jouer en continu. Ajoute
-- un second mécanisme, manuel, decouplé du heartbeat de partie.
alter table public.keep_battle_solo_presence
  add column if not exists manual_available boolean not null default false;

-- Adel (02/09/2026) : bascule manuelle. TTL plus long (30 min) que le
-- heartbeat de partie active (20s) car ce mode n'a pas de boucle de jeu qui
-- rafraîchit en continu -- le mobile envoie un "ping" léger toutes les
-- quelques minutes tant que la bascule reste activée (voir
-- keep_battle_manual_availability_ping ci-dessous) ; sans ping, l'utilisateur
-- sort naturellement de la liste au bout de 30 min au lieu de rester
-- "disponible" indéfiniment après avoir fermé l'appli.
create or replace function public.keep_battle_set_manual_available(p_available boolean, p_theme_code text default 'MIX'::text)
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
  if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme := 'MIX'; end if;
  insert into public.keep_battle_solo_presence(profile_id,theme_code,status,manual_available,last_seen_at)
  values(uid,v_theme,'SOLO',p_available,now())
  on conflict(profile_id) do update set
    manual_available = p_available,
    theme_code = case when p_available then v_theme else keep_battle_solo_presence.theme_code end,
    last_seen_at = case when p_available then now() else keep_battle_solo_presence.last_seen_at end;
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
  update public.keep_battle_solo_presence
  set last_seen_at = now()
  where profile_id = uid and manual_available = true;
end;
$function$;

-- keep_battle_solo_available / keep_battle_challenge_send : un joueur compte
-- comme "disponible" soit via le heartbeat de partie active (20s), soit via
-- la bascule manuelle (30 min). Reste identique sinon -- aucune autre regle
-- touchee.
create or replace function public.keep_battle_solo_available(p_limit integer DEFAULT 12)
 returns TABLE(profile_id uuid, username text, avatar_url text, theme_code text, last_seen_at timestamp with time zone)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select p.id,p.username,p.avatar_url,sp.theme_code,sp.last_seen_at
  from public.keep_battle_solo_presence sp
  join public.profiles p on p.id=sp.profile_id
  where auth.uid() is not null
    and sp.profile_id<>auth.uid()
    and (
      (sp.status='AVAILABLE' and sp.last_seen_at > now()-interval '20 seconds')
      or (sp.manual_available=true and sp.last_seen_at > now()-interval '30 minutes')
    )
    and p.is_public=true
  order by sp.last_seen_at desc
  limit greatest(1,least(coalesce(p_limit,12),30));
$function$;

create or replace function public.keep_battle_challenge_send(p_target_id uuid, p_theme_code text DEFAULT 'MIX'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
 uid uuid:=auth.uid();
 v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
 c public.keep_battle_challenges%rowtype;
 my_name text;
 v_created boolean:=false;
 min_free integer:=3;
 v_notify boolean:=true;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 if not public.keep_profile_has_paid_battle_access(p_target_id) and public.keep_theoretical_free_credit_remaining_for_profile(p_target_id)<min_free then raise exception 'BATTLE_TARGET_NO_CREDIT'; end if;
 if not exists(
   select 1 from public.keep_battle_solo_presence
   where profile_id=p_target_id
     and (
       (status='AVAILABLE' and last_seen_at>now()-interval '20 seconds')
       or (manual_available=true and last_seen_at>now()-interval '30 minutes')
     )
 ) then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
 if not found then
   insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,expires_at)
   values(uid,p_target_id,v_theme,now()+interval '90 seconds')
   on conflict (challenger_id,target_id) where status='PENDING' do nothing returning * into c;
   v_created:=found;
   if not v_created then
     select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
   end if;
 end if;
 if c.id is null then raise exception 'BATTLE_CHALLENGE_CREATE_FAILED'; end if;
 if v_created then
   -- Adel : "recevra des notifications pour des Battle, hormis s'il a
   -- enlevé la notification" -- respecte l'interrupteur general
   -- (system_enabled) comme le reste des notifications interactives.
   select coalesce(np.system_enabled,true) into v_notify from public.notification_preferences np where np.profile_id=p_target_id;
   if coalesce(v_notify,true) then
     select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
     insert into public.notifications(profile_id,type,title,body,data)
     values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s te défie. Accepte ou refuse directement dans KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme,'expiresAt',c.expires_at,'presentation','battle_inline','openMode','stay_in_place'));
   end if;
 end if;
 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;
