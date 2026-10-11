-- KEEP / Loki Music — scale social graph + "La Place" musical community.
-- 30/09/2026
--
-- Objectifs :
-- 1) ne jamais charger des centaines/millions d'abonnés d'un coup ;
-- 2) offrir un espace communautaire musical court, modéré et paginé ;
-- 3) bloquer le harcèlement évident côté serveur avant publication ;
-- 4) réutiliser le système user_blocks existant pour masquer les auteurs bloqués.

create index if not exists idx_profiles_username_lower_id
  on public.profiles (lower(username), id);

create index if not exists idx_follows_followee_follower
  on public.follows (followee_id, follower_id);

create index if not exists idx_follows_follower_followee
  on public.follows (follower_id, followee_id);

create or replace function public.keep_profile_connections_page(
  p_profile_id uuid,
  p_mode text,
  p_limit integer default 24,
  p_after_username text default null,
  p_after_id uuid default null,
  p_search text default null
)
returns table(
  profile_id uuid,
  username text,
  avatar_url text,
  kind text,
  certification_tier text,
  favorite_genres text[],
  is_following boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 40));
  v_search text := nullif(lower(btrim(coalesce(p_search,''))), '');
  v_after text := nullif(lower(btrim(coalesce(p_after_username,''))), '');
begin
  if lower(coalesce(p_mode,'')) not in ('followers','following') then
    raise exception 'invalid_mode' using errcode='22023';
  end if;

  if lower(p_mode) = 'followers' then
    return query
    select
      p.id,
      p.username,
      p.avatar_url,
      p.kind::text,
      case
        when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
        when plan.code = 'VENUE_PRO' then 'VENUE_PRO'
        when plan.code = 'CREATOR_PRO' then 'CREATOR_PRO'
        when plan.code = 'PREMIUM' then 'PREMIUM'
        else 'FREE'
      end::text,
      coalesce(p.favorite_genres, array[]::text[]),
      (v_uid is not null and exists(
        select 1 from public.follows f2
        where f2.follower_id=v_uid and f2.followee_id=p.id
      ))
    from public.follows f
    join public.profiles p on p.id=f.follower_id
    join auth.users u on u.id=p.id
    left join lateral (
      select pl.code::text as code
      from public.subscriptions s
      join public.plans pl on pl.id=s.plan_id
      where s.profile_id=p.id
        and s.status in ('ACTIVE','TRIALING')
        and (s.current_period_end is null or s.current_period_end > now())
      order by s.current_period_start desc nulls last, s.created_at desc
      limit 1
    ) plan on true
    where f.followee_id=p_profile_id
      and p.is_public=true
      and (v_search is null or lower(p.username) like v_search || '%')
      and (
        v_after is null
        or lower(p.username) > v_after
        or (lower(p.username)=v_after and (p_after_id is null or p.id > p_after_id))
      )
    order by lower(p.username), p.id
    limit v_limit;
  else
    return query
    select
      p.id,
      p.username,
      p.avatar_url,
      p.kind::text,
      case
        when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
        when plan.code = 'VENUE_PRO' then 'VENUE_PRO'
        when plan.code = 'CREATOR_PRO' then 'CREATOR_PRO'
        when plan.code = 'PREMIUM' then 'PREMIUM'
        else 'FREE'
      end::text,
      coalesce(p.favorite_genres, array[]::text[]),
      true
    from public.follows f
    join public.profiles p on p.id=f.followee_id
    join auth.users u on u.id=p.id
    left join lateral (
      select pl.code::text as code
      from public.subscriptions s
      join public.plans pl on pl.id=s.plan_id
      where s.profile_id=p.id
        and s.status in ('ACTIVE','TRIALING')
        and (s.current_period_end is null or s.current_period_end > now())
      order by s.current_period_start desc nulls last, s.created_at desc
      limit 1
    ) plan on true
    where f.follower_id=p_profile_id
      and p.is_public=true
      and (v_search is null or lower(p.username) like v_search || '%')
      and (
        v_after is null
        or lower(p.username) > v_after
        or (lower(p.username)=v_after and (p_after_id is null or p.id > p_after_id))
      )
    order by lower(p.username), p.id
    limit v_limit;
  end if;
end;
$function$;

revoke all on function public.keep_profile_connections_page(uuid,text,integer,text,uuid,text) from public;
grant execute on function public.keep_profile_connections_page(uuid,text,integer,text,uuid,text) to anon, authenticated;

create or replace function public.keep_profile_reprisers_page(
  p_profile_id uuid,
  p_limit integer default 16
)
returns table(
  profile_id uuid,
  username text,
  avatar_url text,
  kind text,
  certification_tier text,
  favorite_genres text[],
  reprise_count integer,
  is_following boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,16), 40));
begin
  return query
  with ranked as (
    select kd.profile_id, count(*)::integer as reprise_count
    from public.keep_decisions kd
    where kd.source_user_id=p_profile_id
      and kd.decision='KEPT'
      and kd.profile_id<>p_profile_id
    group by kd.profile_id
    order by count(*) desc, kd.profile_id
    limit v_limit
  )
  select
    p.id,
    p.username,
    p.avatar_url,
    p.kind::text,
    case
      when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
      when plan.code='VENUE_PRO' then 'VENUE_PRO'
      when plan.code='CREATOR_PRO' then 'CREATOR_PRO'
      when plan.code='PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text,
    coalesce(p.favorite_genres, array[]::text[]),
    ranked.reprise_count,
    (v_uid is not null and exists(
      select 1 from public.follows f
      where f.follower_id=v_uid and f.followee_id=p.id
    ))
  from ranked
  join public.profiles p on p.id=ranked.profile_id and p.is_public=true
  join auth.users u on u.id=p.id
  left join lateral (
    select pl.code::text as code
    from public.subscriptions s
    join public.plans pl on pl.id=s.plan_id
    where s.profile_id=p.id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ) plan on true
  order by ranked.reprise_count desc, lower(p.username), p.id;
end;
$function$;

revoke all on function public.keep_profile_reprisers_page(uuid,integer) from public;
grant execute on function public.keep_profile_reprisers_page(uuid,integer) to anon, authenticated;

create table if not exists public.music_agora_rooms (
  slug text primary key,
  label text not null,
  prompt text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.music_agora_messages (
  id bigint generated by default as identity primary key,
  room_slug text not null references public.music_agora_rooms(slug) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  moderation_status text not null default 'VISIBLE'
    check (moderation_status in ('VISIBLE','REVIEW','HIDDEN')),
  created_at timestamptz not null default now()
);

create table if not exists public.music_agora_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null references public.music_agora_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','inappropriate_content','other')),
  created_at timestamptz not null default now(),
  unique(message_id, reporter_id)
);

create index if not exists idx_music_agora_messages_room_id
  on public.music_agora_messages(room_slug, id desc);
create index if not exists idx_music_agora_messages_profile_created
  on public.music_agora_messages(profile_id, created_at desc);
create index if not exists idx_music_agora_reports_message
  on public.music_agora_message_reports(message_id, created_at desc);

alter table public.music_agora_rooms enable row level security;
alter table public.music_agora_messages enable row level security;
alter table public.music_agora_message_reports enable row level security;

drop policy if exists music_agora_rooms_read on public.music_agora_rooms;
create policy music_agora_rooms_read on public.music_agora_rooms
for select to anon, authenticated
using (is_active=true);

revoke insert, update, delete on public.music_agora_rooms from anon, authenticated;
revoke all on public.music_agora_messages from anon, authenticated;
revoke all on public.music_agora_message_reports from anon, authenticated;

insert into public.music_agora_rooms(slug,label,prompt,sort_order,is_active) values
  ('place','La Place','Le morceau qui te suit depuis des années ?',10,true),
  ('souvenirs','Souvenirs','Quel titre te ramène instantanément à un moment précis ?',20,true),
  ('decouvertes','Découvertes','Quel morceau mérite beaucoup plus d''écoutes ?',30,true),
  ('debats','Débats','Une opinion musicale que tu peux défendre sans t''énerver ?',40,true)
on conflict (slug) do update
set label=excluded.label,prompt=excluded.prompt,sort_order=excluded.sort_order,is_active=excluded.is_active;

create or replace function public.keep_agora_rooms()
returns table(slug text,label text,prompt text,sort_order integer)
language sql
stable
security definer
set search_path=public
as $function$
  select r.slug,r.label,r.prompt,r.sort_order
  from public.music_agora_rooms r
  where r.is_active=true
  order by r.sort_order,r.slug;
$function$;

revoke all on function public.keep_agora_rooms() from public;
grant execute on function public.keep_agora_rooms() to anon, authenticated;

create or replace function public.keep_agora_contains_blocked_language(p_body text)
returns boolean
language plpgsql
immutable
as $function$
declare
  v text := ' ' || regexp_replace(lower(coalesce(p_body,'')), '[^[:alnum:]àâäéèêëîïôöùûüç]+', ' ', 'g') || ' ';
  term text;
begin
  foreach term in array array[
    ' connard ',' connasse ',' salope ',' enculé ',' encule ',' fils de pute ',
    ' va te faire foutre ',' ferme ta gueule ',' nique ta ',' nique ton ',
    ' sale arabe ',' sale noir ',' sale juif ',' sale musulman ',' sale gay ',
    ' fuck you ',' fucking idiot ',' bitch ',' faggot ',' nigger '
  ] loop
    if position(term in v)>0 then return true; end if;
  end loop;
  return false;
end;
$function$;

create or replace function public.keep_agora_messages(
  p_room_slug text,
  p_before_id bigint default null,
  p_limit integer default 24
)
returns table(
  id bigint,
  room_slug text,
  profile_id uuid,
  username text,
  avatar_url text,
  kind text,
  body text,
  created_at timestamptz
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
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then
    return;
  end if;
  return query
  select
    m.id,m.room_slug,m.profile_id,p.username,p.avatar_url,p.kind::text,m.body,m.created_at
  from public.music_agora_messages m
  join public.profiles p on p.id=m.profile_id and p.is_public=true
  where m.room_slug=p_room_slug
    and m.moderation_status='VISIBLE'
    and (p_before_id is null or m.id<p_before_id)
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

revoke all on function public.keep_agora_messages(text,bigint,integer) from public;
grant execute on function public.keep_agora_messages(text,bigint,integer) to anon, authenticated;

create or replace function public.keep_agora_post_message(
  p_room_slug text,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body,''));
  v_id bigint;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.is_public=true) then
    raise exception 'public_profile_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then
    raise exception 'room_unavailable' using errcode='22023';
  end if;
  if char_length(v_body)<2 or char_length(v_body)>280 then
    raise exception 'message_length' using errcode='22023';
  end if;
  if public.keep_agora_contains_blocked_language(v_body) then
    raise exception 'message_blocked_language' using errcode='22023';
  end if;
  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 minute')>=4 then
    raise exception 'rate_limited' using errcode='57014';
  end if;
  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 hour')>=30 then
    raise exception 'rate_limited' using errcode='57014';
  end if;

  insert into public.music_agora_messages(room_slug,profile_id,body)
  values(p_room_slug,v_uid,v_body)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.keep_agora_post_message(text,text) from public;
grant execute on function public.keep_agora_post_message(text,text) to authenticated;

create or replace function public.keep_agora_report_message(
  p_message_id bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_reports integer;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_reason not in ('spam','harassment','inappropriate_content','other') then
    raise exception 'invalid_reason' using errcode='22023';
  end if;
  select profile_id into v_target from public.music_agora_messages where id=p_message_id;
  if v_target is null then raise exception 'message_not_found' using errcode='P0002'; end if;
  if v_target=v_uid then raise exception 'cannot_report_self' using errcode='22023'; end if;

  insert into public.music_agora_message_reports(message_id,reporter_id,reason)
  values(p_message_id,v_uid,p_reason)
  on conflict(message_id,reporter_id) do nothing;

  select count(*) into v_reports from public.music_agora_message_reports where message_id=p_message_id;
  if v_reports>=3 then
    update public.music_agora_messages
    set moderation_status='REVIEW'
    where id=p_message_id and moderation_status='VISIBLE';
  end if;
end;
$function$;

revoke all on function public.keep_agora_report_message(bigint,text) from public;
grant execute on function public.keep_agora_report_message(bigint,text) to authenticated;

create or replace function public.admin_agora_report_queue(p_limit integer default 100)
returns table(
  message_id bigint,
  room_slug text,
  profile_id uuid,
  username text,
  body text,
  created_at timestamptz,
  moderation_status text,
  report_count bigint,
  reasons text[]
)
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,100),200));
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return query
  select
    m.id,m.room_slug,m.profile_id,p.username,m.body,m.created_at,m.moderation_status,
    count(r.id)::bigint,
    coalesce(array_agg(distinct r.reason) filter(where r.reason is not null), array[]::text[])
  from public.music_agora_messages m
  join public.profiles p on p.id=m.profile_id
  left join public.music_agora_message_reports r on r.message_id=m.id
  where m.moderation_status='REVIEW' or r.id is not null
  group by m.id,m.room_slug,m.profile_id,p.username,m.body,m.created_at,m.moderation_status
  order by (m.moderation_status='REVIEW') desc, count(r.id) desc, m.id desc
  limit v_limit;
end;
$function$;

revoke all on function public.admin_agora_report_queue(integer) from public, anon;
grant execute on function public.admin_agora_report_queue(integer) to authenticated;

create or replace function public.admin_agora_moderate_message(
  p_message_id bigint,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if upper(coalesce(p_decision,'')) not in ('RESTORE','HIDE') then
    raise exception 'invalid_decision' using errcode='22023';
  end if;
  update public.music_agora_messages
  set moderation_status=case when upper(p_decision)='HIDE' then 'HIDDEN' else 'VISIBLE' end
  where id=p_message_id;
  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,before,after)
  values(v_uid,'agora.message.moderated','music_agora_message',p_message_id::text,null,jsonb_build_object('decision',upper(p_decision)));
end;
$function$;

revoke all on function public.admin_agora_moderate_message(bigint,text) from public, anon;
grant execute on function public.admin_agora_moderate_message(bigint,text) to authenticated;
