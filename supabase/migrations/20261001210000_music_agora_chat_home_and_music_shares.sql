-- Tchat Communauté: opt-in home widget, safe direct replies, room subscriptions,
-- music shares (masked/full), newest-first feed and notification fanout without global spam.

alter table public.profiles
  add column if not exists community_chat_home_enabled boolean not null default false,
  add column if not exists community_chat_notifications boolean not null default true;

alter table public.music_agora_messages
  add column if not exists target_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists shared_track_id uuid references public.tracks(id) on delete set null,
  add column if not exists music_reveal_mode text not null default 'NONE';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='music_agora_messages_reveal_mode_check'
  ) then
    alter table public.music_agora_messages
      add constraint music_agora_messages_reveal_mode_check
      check (music_reveal_mode in ('NONE','MASKED','FULL'));
  end if;
end $$;

create index if not exists idx_music_agora_messages_target_created
  on public.music_agora_messages(target_profile_id,created_at desc)
  where target_profile_id is not null;
create index if not exists idx_music_agora_messages_room_created
  on public.music_agora_messages(room_slug,id desc);

create table if not exists public.music_agora_room_subscriptions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  room_slug text not null references public.music_agora_rooms(slug) on delete cascade,
  notifications_enabled boolean not null default true,
  last_notified_message_id bigint not null default 0,
  last_read_message_id bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id,room_slug)
);

alter table public.music_agora_room_subscriptions enable row level security;
drop policy if exists music_agora_room_subscriptions_owner_read on public.music_agora_room_subscriptions;
create policy music_agora_room_subscriptions_owner_read
on public.music_agora_room_subscriptions for select
using (profile_id=(select auth.uid()));

create or replace function public.keep_agora_my_settings()
returns jsonb
language sql
stable
security definer
set search_path=public,auth
as $function$
  select jsonb_build_object(
    'homeEnabled',coalesce(p.community_chat_home_enabled,false),
    'notificationsEnabled',coalesce(p.community_chat_notifications,true)
  )
  from public.profiles p
  where p.id=auth.uid();
$function$;

revoke all on function public.keep_agora_my_settings() from public,anon;
grant execute on function public.keep_agora_my_settings() to authenticated;

create or replace function public.keep_agora_set_settings(
  p_home_enabled boolean,
  p_notifications_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_latest bigint := 0;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  update public.profiles
  set community_chat_home_enabled=coalesce(p_home_enabled,false),
      community_chat_notifications=coalesce(p_notifications_enabled,true)
  where id=v_uid;

  if coalesce(p_home_enabled,false) then
    select coalesce(max(id),0) into v_latest
    from public.music_agora_messages
    where room_slug='place' and moderation_status='VISIBLE' and target_profile_id is null;

    insert into public.music_agora_room_subscriptions(
      profile_id,room_slug,notifications_enabled,last_notified_message_id,last_read_message_id
    )
    values(v_uid,'place',coalesce(p_notifications_enabled,true),v_latest,v_latest)
    on conflict(profile_id,room_slug) do update
    set notifications_enabled=excluded.notifications_enabled,
        updated_at=now();
  else
    update public.music_agora_room_subscriptions
    set notifications_enabled=false,updated_at=now()
    where profile_id=v_uid;
  end if;

  return public.keep_agora_my_settings();
end;
$function$;

revoke all on function public.keep_agora_set_settings(boolean,boolean) from public,anon;
grant execute on function public.keep_agora_set_settings(boolean,boolean) to authenticated;

create or replace function public.keep_agora_subscribe_room(
  p_room_slug text,
  p_subscribed boolean default true,
  p_notifications_enabled boolean default true
)
returns boolean
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_latest bigint := 0;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.music_agora_rooms where slug=p_room_slug and is_active=true) then
    raise exception 'room_unavailable' using errcode='22023';
  end if;

  if not coalesce(p_subscribed,true) then
    delete from public.music_agora_room_subscriptions where profile_id=v_uid and room_slug=p_room_slug;
    return false;
  end if;

  select coalesce(max(id),0) into v_latest
  from public.music_agora_messages
  where room_slug=p_room_slug and moderation_status='VISIBLE' and target_profile_id is null;

  insert into public.music_agora_room_subscriptions(
    profile_id,room_slug,notifications_enabled,last_notified_message_id,last_read_message_id
  )
  values(v_uid,p_room_slug,coalesce(p_notifications_enabled,true),v_latest,v_latest)
  on conflict(profile_id,room_slug) do update
  set notifications_enabled=excluded.notifications_enabled,updated_at=now();
  return true;
end;
$function$;

revoke all on function public.keep_agora_subscribe_room(text,boolean,boolean) from public,anon;
grant execute on function public.keep_agora_subscribe_room(text,boolean,boolean) to authenticated;

create or replace function public.keep_agora_mark_room_read(p_room_slug text,p_message_id bigint)
returns boolean
language plpgsql
security definer
set search_path=public,auth
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  insert into public.music_agora_room_subscriptions(
    profile_id,room_slug,notifications_enabled,last_notified_message_id,last_read_message_id
  ) values(v_uid,p_room_slug,false,coalesce(p_message_id,0),coalesce(p_message_id,0))
  on conflict(profile_id,room_slug) do update
  set last_read_message_id=greatest(public.music_agora_room_subscriptions.last_read_message_id,excluded.last_read_message_id),
      updated_at=now();
  return true;
end;
$function$;

revoke all on function public.keep_agora_mark_room_read(text,bigint) from public,anon;
grant execute on function public.keep_agora_mark_room_read(text,bigint) to authenticated;

create or replace function public.keep_agora_post_message_v2(
  p_room_slug text,
  p_body text default '',
  p_target_profile_id uuid default null,
  p_shared_track_id uuid default null,
  p_reveal_mode text default 'NONE'
)
returns bigint
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body,''));
  v_mode text := upper(coalesce(p_reveal_mode,'NONE'));
  v_id bigint;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.is_public=true) then
    raise exception 'public_profile_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then
    raise exception 'room_unavailable' using errcode='22023';
  end if;

  if p_shared_track_id is null and (char_length(v_body)<2 or char_length(v_body)>280) then
    raise exception 'message_length' using errcode='22023';
  end if;
  if p_shared_track_id is not null and char_length(v_body)>280 then
    raise exception 'message_length' using errcode='22023';
  end if;
  if v_body<>'' and public.keep_agora_contains_blocked_language(v_body) then
    raise exception 'message_blocked_language' using errcode='22023';
  end if;
  if v_mode not in ('NONE','MASKED','FULL') then raise exception 'invalid_reveal_mode' using errcode='22023'; end if;
  if p_shared_track_id is null then v_mode := 'NONE'; end if;
  if p_shared_track_id is not null and not exists(select 1 from public.tracks where id=p_shared_track_id) then
    raise exception 'track_not_found' using errcode='P0002';
  end if;

  if p_target_profile_id is not null then
    if p_target_profile_id=v_uid then raise exception 'cannot_message_self' using errcode='22023'; end if;
    if not exists(select 1 from public.profiles where id=p_target_profile_id and is_public=true) then
      raise exception 'target_unavailable' using errcode='P0002';
    end if;
    if exists(
      select 1 from public.user_blocks b
      where (b.blocker_id=v_uid and b.blocked_id=p_target_profile_id)
         or (b.blocker_id=p_target_profile_id and b.blocked_id=v_uid)
    ) then raise exception 'blocked_relationship' using errcode='42501'; end if;
  end if;

  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 minute')>=4 then
    raise exception 'rate_limited' using errcode='57014';
  end if;
  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 hour')>=30 then
    raise exception 'rate_limited' using errcode='57014';
  end if;

  insert into public.music_agora_messages(
    room_slug,profile_id,body,target_profile_id,shared_track_id,music_reveal_mode
  ) values(
    p_room_slug,v_uid,coalesce(nullif(v_body,''),'♫ Partage musical'),p_target_profile_id,p_shared_track_id,v_mode
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.keep_agora_post_message_v2(text,text,uuid,uuid,text) from public,anon;
grant execute on function public.keep_agora_post_message_v2(text,text,uuid,uuid,text) to authenticated;

create or replace function public.keep_agora_messages_v2(
  p_room_slug text,
  p_before_id bigint default null,
  p_limit integer default 24
)
returns table(
  id bigint,room_slug text,profile_id uuid,username text,avatar_url text,kind text,body text,created_at timestamptz,
  target_profile_id uuid,target_username text,shared_track_id uuid,music_reveal_mode text,
  track_title text,track_artist text,track_artwork_url text,track_preview_url text
)
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,24),40));
begin
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then return; end if;

  return query
  select
    m.id,m.room_slug,m.profile_id,p.username,p.avatar_url,p.kind::text,m.body,m.created_at,
    m.target_profile_id,tp.username,m.shared_track_id,m.music_reveal_mode,
    case when m.music_reveal_mode='FULL' then t.title else null end,
    case when m.music_reveal_mode='FULL' then t.artist else null end,
    case when m.music_reveal_mode='FULL' then t.artwork_url else null end,
    t.preview_url
  from public.music_agora_messages m
  join public.profiles p on p.id=m.profile_id and p.is_public=true
  left join public.profiles tp on tp.id=m.target_profile_id
  left join public.tracks t on t.id=m.shared_track_id
  where m.room_slug=p_room_slug
    and m.moderation_status='VISIBLE'
    and (p_before_id is null or m.id<p_before_id)
    and (
      m.target_profile_id is null
      or (v_uid is not null and (m.target_profile_id=v_uid or m.profile_id=v_uid))
    )
    and (
      v_uid is null
      or not exists(
        select 1 from public.user_blocks b
        where (b.blocker_id=v_uid and b.blocked_id=m.profile_id)
           or (b.blocker_id=m.profile_id and b.blocked_id=v_uid)
      )
    )
  order by m.id desc
  limit v_limit;
end;
$function$;

revoke all on function public.keep_agora_messages_v2(text,bigint,integer) from public;
grant execute on function public.keep_agora_messages_v2(text,bigint,integer) to anon,authenticated;

create table if not exists public.music_agora_direct_notification_deliveries(
  message_id bigint not null references public.music_agora_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key(message_id,profile_id)
);

alter table public.music_agora_direct_notification_deliveries enable row level security;

create or replace function public.keep_agora_notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare v_sender text;
begin
  if new.target_profile_id is null then return new; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=new.target_profile_id and coalesce(p.community_chat_notifications,true)
  ) then return new; end if;

  select username into v_sender from public.profiles where id=new.profile_id;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values(
    new.target_profile_id,'AGORA_DIRECT',
    '@'||coalesce(v_sender,'membre')||' t’a écrit',
    case when new.shared_track_id is not null
      then '@'||coalesce(v_sender,'membre')||' t’a partagé une musique dans le Tchat.'
      else left(new.body,120) end,
    jsonb_build_object(
      'event','AGORA_DIRECT','roomSlug',new.room_slug,'messageId',new.id,
      'senderId',new.profile_id,'senderUsername',v_sender,'sharedTrackId',new.shared_track_id,
      'soundKind','social'
    ),
    'CREATED',0
  );

  insert into public.music_agora_direct_notification_deliveries(message_id,profile_id)
  values(new.id,new.target_profile_id)
  on conflict do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_music_agora_notify_direct on public.music_agora_messages;
create trigger trg_music_agora_notify_direct
after insert on public.music_agora_messages
for each row execute function public.keep_agora_notify_direct_message();

create or replace function public.keep_agora_dispatch_room_notifications(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path=public
as $function$
declare
  r record;
  v_count integer := 0;
  v_sender text;
  v_body text;
  v_room_label text;
begin
  for r in
    select s.profile_id,s.room_slug,max(m.id) as latest_id,count(*) as new_count
    from public.music_agora_room_subscriptions s
    join public.profiles recipient on recipient.id=s.profile_id
    join public.music_agora_messages m
      on m.room_slug=s.room_slug
     and m.id>s.last_notified_message_id
     and m.moderation_status='VISIBLE'
     and m.target_profile_id is null
     and m.profile_id<>s.profile_id
    where s.notifications_enabled=true
      and recipient.community_chat_home_enabled=true
      and recipient.community_chat_notifications=true
      and not exists(
        select 1 from public.user_blocks b
        where (b.blocker_id=s.profile_id and b.blocked_id=m.profile_id)
           or (b.blocker_id=m.profile_id and b.blocked_id=s.profile_id)
      )
    group by s.profile_id,s.room_slug
    order by max(m.id)
    limit greatest(1,least(coalesce(p_limit,200),500))
  loop
    select p.username,m.body,room.label
      into v_sender,v_body,v_room_label
    from public.music_agora_messages m
    join public.profiles p on p.id=m.profile_id
    join public.music_agora_rooms room on room.slug=m.room_slug
    where m.id=r.latest_id;

    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values(
      r.profile_id,'AGORA_ROOM',
      'Tchat · '||coalesce(v_room_label,r.room_slug),
      case when r.new_count>1
        then r.new_count||' nouveaux messages dans ce salon.'
        else '@'||coalesce(v_sender,'membre')||' : '||left(coalesce(v_body,''),100)
      end,
      jsonb_build_object(
        'event','AGORA_ROOM','roomSlug',r.room_slug,'messageId',r.latest_id,
        'senderUsername',v_sender,'newCount',r.new_count,'soundKind','social'
      ),
      'CREATED',0
    );

    update public.music_agora_room_subscriptions
    set last_notified_message_id=r.latest_id,last_notified_at=now(),updated_at=now()
    where profile_id=r.profile_id and room_slug=r.room_slug;
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$function$;

-- last_notified_at is intentionally added after the dispatcher definition is authored,
-- so older installations upgrading this migration get exactly the same schema.
alter table public.music_agora_room_subscriptions
  add column if not exists last_notified_at timestamptz;

revoke all on function public.keep_agora_dispatch_room_notifications(integer) from public,anon,authenticated;
grant execute on function public.keep_agora_dispatch_room_notifications(integer) to service_role;

do $$
declare jid bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for jid in select jobid from cron.job where jobname='keep-agora-room-notifications'
    loop
      perform cron.unschedule(jid);
    end loop;
    perform cron.schedule(
      'keep-agora-room-notifications',
      '* * * * *',
      'select public.keep_agora_dispatch_room_notifications(200);'
    );
  end if;
end $$;
