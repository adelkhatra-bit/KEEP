-- Issue #52. No historical pins or events are removed or rewritten.
-- A surrogate PK permits event pins; the non-partial music UNIQUE deliberately
-- preserves every existing ON CONFLICT(profile_id, track_id) music RPC.
begin;
-- The real create/edit UI does not require an attached playlist. Persist its
-- explicitly selected event styles; do not infer them from organizer tastes.
alter table public.events add column if not exists music_genres text[] not null default '{}';
alter table public.story_pins
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists event_id uuid references public.events(id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.story_pins'::regclass
      and conname='story_pins_profile_track_key') then
    alter table public.story_pins add constraint story_pins_profile_track_key unique(profile_id,track_id);
  end if;
  if exists (select 1 from pg_constraint where conrelid='public.story_pins'::regclass
      and contype='p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (profile_id, track_id)') then
    alter table public.story_pins drop constraint story_pins_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.story_pins'::regclass and contype='p') then
    alter table public.story_pins add constraint story_pins_pkey primary key(id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.story_pins'::regclass
      and conname='story_pins_profile_event_key') then
    alter table public.story_pins add constraint story_pins_profile_event_key unique(profile_id,event_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.story_pins'::regclass
      and conname='story_pins_track_event_xor') then
    alter table public.story_pins add constraint story_pins_track_event_xor
      check ((track_id is not null) <> (event_id is not null));
  end if;
end $$;
alter table public.story_pins alter column track_id drop not null;
create index if not exists story_pins_event_idx on public.story_pins(event_id) where event_id is not null;

create or replace function public.keep_event_story_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.moderation_status='APPROVED' and not new.is_disabled then
    if tg_op='INSERT' then
      insert into public.story_pins(profile_id,event_id) values(new.creator_id,new.id)
      on conflict(profile_id,event_id) do nothing;
    elsif old.moderation_status is distinct from new.moderation_status then
      -- Actual publication occurs when the moderator approves a PENDING event.
      -- Reapproval never resets its story lifetime or creates duplicate pins.
      insert into public.story_pins(profile_id,event_id) values(new.creator_id,new.id)
      on conflict(profile_id,event_id) do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.keep_event_story_publish() from public,anon,authenticated;
drop trigger if exists keep_event_story_publish on public.events;
create trigger keep_event_story_publish after insert or update of moderation_status on public.events
  for each row execute function public.keep_event_story_publish();

create or replace function public.keep_event_reader_eligible()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id=auth.uid()
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false));
$$;
create or replace function public.keep_event_story_profile_linked(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_profile_id=auth.uid()
    or exists(select 1 from public.follows f
      where (f.follower_id=auth.uid() and f.followee_id=p_profile_id)
         or (f.followee_id=auth.uid() and f.follower_id=p_profile_id))
    or exists(select 1 from public.keep_decisions k where k.decision='KEPT'
      and ((k.profile_id=auth.uid() and k.source_user_id=p_profile_id)
        or (k.profile_id=p_profile_id and k.source_user_id=auth.uid())))
  );
$$;
create or replace function public.keep_event_is_visible(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.keep_event_reader_eligible() and exists(
    select 1 from public.events e where e.id=p_event_id
      and e.moderation_status='APPROVED' and not e.is_disabled
      and (e.audience_mode<>'ADULTS_18_PLUS' or exists(
        select 1 from public.profiles p where p.id=auth.uid() and p.is_adult))
  );
$$;
create or replace function public.keep_event_rsvp_allowed(p_event_id uuid,p_status text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.keep_event_is_visible(p_event_id) and exists(
    select 1 from public.events e where e.id=p_event_id and (
      p_status<>'GOING' or coalesce(e.ticket_price_cents,0)<=0 or exists(
        select 1 from public.event_ticket_orders o where o.event_id=e.id
          and o.buyer_id=auth.uid() and o.seller_id=e.creator_id and o.status='COMPLETED'
      )
    )
  );
$$;
revoke all on function public.keep_event_reader_eligible() from public,anon;
revoke all on function public.keep_event_story_profile_linked(uuid) from public,anon;
revoke all on function public.keep_event_is_visible(uuid) from public,anon;
revoke all on function public.keep_event_rsvp_allowed(uuid,text) from public,anon;
grant execute on function public.keep_event_reader_eligible(),
  public.keep_event_story_profile_linked(uuid), public.keep_event_is_visible(uuid),
  public.keep_event_rsvp_allowed(uuid,text) to authenticated;

-- Restrictive policies AND with the historic permissive policies, including
-- creator FOR ALL: hiding content never deletes the pin. Music RLS unchanged.
drop policy if exists story_pins_event_visibility on public.story_pins;
create policy story_pins_event_visibility on public.story_pins as restrictive
  for select to authenticated using (event_id is null or (
    public.keep_event_is_visible(event_id) and public.keep_event_story_profile_linked(profile_id)));
drop policy if exists events_published_read on public.events;
create policy events_published_read on public.events as restrictive
  for select to authenticated using (creator_id=auth.uid() or public.keep_event_is_visible(id));
drop policy if exists events_published_read_anon on public.events;
create policy events_published_read_anon on public.events as restrictive
  for select to anon using (moderation_status='APPROVED' and not is_disabled and audience_mode<>'ADULTS_18_PLUS');
drop policy if exists event_rsvps_published_write on public.event_rsvps;
drop policy if exists event_rsvps_published_insert on public.event_rsvps;
create policy event_rsvps_published_insert on public.event_rsvps as restrictive
  for insert to authenticated
  with check (profile_id=auth.uid() and public.keep_event_rsvp_allowed(event_id,status::text));
drop policy if exists event_rsvps_published_update on public.event_rsvps;
create policy event_rsvps_published_update on public.event_rsvps as restrictive
  for update to authenticated using (profile_id=auth.uid())
  with check (profile_id=auth.uid() and public.keep_event_rsvp_allowed(event_id,status::text));

create or replace function public.keep_story_events(p_profile_ids uuid[])
returns table(event_id uuid,profile_id uuid,name text,image_url text,starts_at timestamptz,
  ends_at timestamptz,venue_name text,country_code text,currency_code text,
  ticket_price_cents integer,genres text[],pinned_at timestamptz,my_rsvp text,
  creator_username text,creator_avatar_url text,moderation_status text,
  photo_status text,text_status text,is_disabled boolean,
  viewer_country_code text,viewer_currency_code text)
language sql stable security definer set search_path = '' as $$
  select e.id,e.creator_id,e.name,e.image_url,e.starts_at,e.ends_at,e.venue_name,
    e.country_code::text,c.default_currency_code::text,e.ticket_price_cents,
    coalesce((select array_agg(distinct lower(trim(g))) from (
      select unnest(e.music_genres) as g
      union all
      select unnest(t.genres) as g from public.playlist_tracks pt
        join public.tracks t on t.id=pt.track_id where pt.playlist_id=e.playlist_id
    ) event_styles where trim(g)<>''),array[]::text[]),
    sp.pinned_at,(select r.status::text from public.event_rsvps r where r.event_id=e.id and r.profile_id=auth.uid()),
    creator.username,creator.avatar_url,e.moderation_status::text,e.photo_status::text,e.text_status::text,
    e.is_disabled,viewer.country_code::text,viewer_country.default_currency_code::text
  from public.story_pins sp join public.events e on e.id=sp.event_id
  join public.profiles creator on creator.id=e.creator_id
  join public.profiles viewer on viewer.id=auth.uid()
  left join public.countries c on c.code=e.country_code
  left join public.countries viewer_country on viewer_country.code=viewer.country_code
  where sp.profile_id=any(p_profile_ids) and sp.profile_id=e.creator_id
    and sp.pinned_at>now()-interval '24 hours'
    and public.keep_event_is_visible(e.id)
    and public.keep_event_story_profile_linked(sp.profile_id)
  order by sp.pinned_at desc,e.id;
$$;

create or replace function public.keep_pulse_events(p_limit integer default 20)
returns table(event_id uuid,profile_id uuid,name text,image_url text,starts_at timestamptz,
  ends_at timestamptz,venue_name text,country_code text,currency_code text,
  ticket_price_cents integer,genres text[],pinned_at timestamptz,my_rsvp text,
  creator_username text,creator_avatar_url text,moderation_status text,
  photo_status text,text_status text,is_disabled boolean,
  viewer_country_code text,viewer_currency_code text)
language sql stable security definer set search_path = '' as $$
  select e.id,e.creator_id,e.name,e.image_url,e.starts_at,e.ends_at,e.venue_name,
    e.country_code::text,c.default_currency_code::text,e.ticket_price_cents,styles.genres,
    null::timestamptz,(select r.status::text from public.event_rsvps r where r.event_id=e.id and r.profile_id=auth.uid()),
    creator.username,creator.avatar_url,e.moderation_status::text,e.photo_status::text,e.text_status::text,
    e.is_disabled,viewer.country_code::text,c.default_currency_code::text
  from public.profiles viewer
  join public.countries c on c.code=viewer.country_code
  join public.events e on e.country_code=viewer.country_code
  join public.profiles creator on creator.id=e.creator_id
  cross join lateral (
    select array_agg(distinct lower(trim(g))) as genres from (
      select unnest(e.music_genres) as g
      union all
      select unnest(t.genres) as g from public.playlist_tracks pt
        join public.tracks t on t.id=pt.track_id where pt.playlist_id=e.playlist_id
    ) event_styles where trim(g)<>''
  ) styles
  where viewer.id=auth.uid() and public.keep_event_is_visible(e.id)
    and c.default_currency_code is not null and e.starts_at>=now()
    and exists(select 1 from public.profile_music_taste_scores s where s.profile_id=viewer.id
      and s.taste_type='GENRE' and s.score>0 and exists(
        select 1 from unnest(styles.genres) g
        where public.keep_music_style_key(s.taste_key)<>'' and
          public.keep_music_style_key(s.taste_key)=public.keep_music_style_key(g)))
    -- 100 km approximate zone when BOTH parties have coordinates. Never
    -- fall back to another country, even when either location is absent.
    and (viewer.approx_lat is null or viewer.approx_lng is null or e.approx_lat is null or e.approx_lng is null
      or (viewer.approx_lat between -90 and 90 and e.approx_lat between -90 and 90
        and viewer.approx_lng between -180 and 180 and e.approx_lng between -180 and 180
        and 6371 * 2 * asin(sqrt(least(1.0,
          power(sin(radians(e.approx_lat-viewer.approx_lat)/2),2)
          + cos(radians(viewer.approx_lat))*cos(radians(e.approx_lat))
          *power(sin(radians(e.approx_lng-viewer.approx_lng)/2),2))))<=100))
  order by e.starts_at,e.id limit greatest(1,least(coalesce(p_limit,20),50));
$$;
revoke all on function public.keep_story_events(uuid[]) from public,anon;
revoke all on function public.keep_pulse_events(integer) from public,anon;
grant execute on function public.keep_story_events(uuid[]),public.keep_pulse_events(integer) to authenticated;

-- Existing SHARE analytics ledger, but an explicit FK (NOT user-supplied JSON)
-- identifies trusted engagement. Legacy track_keep_event cannot forge it.
-- Views cannot go into product_events: existing dashboard/growth RPCs count
-- all its rows as shares. A private view ledger avoids inflating share rewards
-- or rewriting unrelated financial/admin RPCs. Both ledgers retain audit rows.
alter table public.product_events add column if not exists event_id uuid references public.events(id) on delete set null;
create unique index if not exists product_events_event_engagement_unique
  on public.product_events(profile_id,event_id,event_name)
  where event_id is not null and event_name='event_share';
create index if not exists product_events_event_idx on public.product_events(event_id) where event_id is not null;
-- Keep raw visitor identities/metadata private even if grants drift.
drop policy if exists product_events_engagement_private on public.product_events;
create policy product_events_engagement_private on public.product_events as restrictive
  for all to authenticated,anon using (event_id is null) with check (event_id is null);

create table if not exists public.event_card_views (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  country_code char(2) references public.countries(code),
  created_at timestamptz not null default now(),
  unique(event_id,profile_id)
);
alter table public.event_card_views enable row level security;
revoke all on public.event_card_views from anon,authenticated;
create index if not exists event_card_views_country_idx on public.event_card_views(country_code);

create or replace function public.keep_record_event_engagement(p_event_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_inserted integer;
begin
  if not public.keep_event_reader_eligible() then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_action is null or p_action not in ('view','share') then raise exception 'INVALID_EVENT_ACTION'; end if;
  select * into v_event from public.events where id=p_event_id for share;
  if not found or not public.keep_event_is_visible(p_event_id) then
    raise exception 'EVENT_NOT_VISIBLE' using errcode='42501';
  end if;
  if v_event.creator_id=auth.uid() then return false; end if;
  if p_action='view' then
    insert into public.event_card_views(profile_id,event_id,country_code)
      values(auth.uid(),v_event.id,v_event.country_code) on conflict do nothing;
  else
    insert into public.product_events(profile_id,event_id,event_name,channel,country_code,metadata)
      values(auth.uid(),v_event.id,'event_share','event_card',v_event.country_code,'{}'::jsonb)
      on conflict do nothing;
  end if;
  get diagnostics v_inserted=row_count;
  return v_inserted=1;
end $$;
revoke all on function public.keep_record_event_engagement(uuid,text) from public,anon;
grant execute on function public.keep_record_event_engagement(uuid,text) to authenticated;

create or replace function public.keep_my_event_stats(p_event_id uuid default null)
returns table(event_id uuid,views bigint,going bigint,shares bigint)
language sql stable security definer set search_path = '' as $$
  select e.id,
    (select count(*) from public.event_card_views v where v.event_id=e.id),
    (select count(*) from public.event_rsvps r where r.event_id=e.id and r.status='GOING'),
    (select count(*) from public.product_events pe where pe.event_id=e.id and pe.event_name='event_share')
  from public.events e where e.creator_id=auth.uid()
    and public.keep_event_reader_eligible() and (p_event_id is null or e.id=p_event_id);
$$;
revoke all on function public.keep_my_event_stats(uuid) from public,anon;
grant execute on function public.keep_my_event_stats(uuid) to authenticated;

create or replace function public.admin_event_country_stats(p_country text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.admin_users a where a.id=auth.uid() and a.is_active
    and a.role::text in ('SUPER_ADMIN','ADMIN')) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('country_code',s.code,
    'currency_code',s.default_currency_code,'views',s.views,'shares',s.shares,'going',s.going) order by s.code)
    from (
      select c.code,c.default_currency_code,
        (select count(*) from public.event_card_views v where v.country_code=c.code and v.event_id is not null) as views,
        (select count(*) from public.product_events pe where pe.country_code=c.code and pe.event_id is not null and pe.event_name='event_share') as shares,
        (select count(*) from public.event_rsvps r join public.events e on e.id=r.event_id where e.country_code=c.code and r.status='GOING') as going
      from public.countries c where p_country is null or c.code::text=upper(trim(p_country))
    ) s),'[]'::jsonb);
end $$;
revoke all on function public.admin_event_country_stats(text) from public,anon;
grant execute on function public.admin_event_country_stats(text) to authenticated;
commit;
