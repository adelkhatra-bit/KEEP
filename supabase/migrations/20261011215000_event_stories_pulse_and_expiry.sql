-- Stories d'événements : 24 h, modération APPROVED, RSVPs et score Pulse.
-- Sans modifier ni supprimer les Stories musicales ou les événements existants.
create table if not exists public.keep_event_story_shares (
  event_id uuid primary key references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_keep_event_story_shares_recent on public.keep_event_story_shares(created_at desc);
alter table public.keep_event_story_shares enable row level security;
revoke all on public.keep_event_story_shares from anon, authenticated;
-- Toutes les lectures/écritures passent par les deux fonctions vérifiant modération/expiration.

create or replace function public.keep_publish_event_story(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth
as $fn$
declare
  v_uid uuid:=auth.uid();
  v_event record;
  v_share_at timestamptz;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select e.creator_id,e.starts_at,e.ends_at,e.moderation_status,e.is_disabled into v_event
  from public.events e where e.id=p_event_id;
  if not found or v_event.creator_id is distinct from v_uid then
    raise exception 'event_not_owned';
  end if;
  if v_event.is_disabled or v_event.moderation_status::text <> 'APPROVED' then
    raise exception 'event_not_approved';
  end if;
  if coalesce(v_event.ends_at,v_event.starts_at+interval '6 hours') <= now() then
    raise exception 'event_has_ended';
  end if;
  -- Idempotence : un même événement ne peut pas inonder les Stories.
  insert into public.keep_event_story_shares(event_id,profile_id,created_at)
  values(p_event_id,v_uid,now())
  on conflict(event_id) do update
    set created_at=case
      when public.keep_event_story_shares.created_at < now()-interval '12 hours' then now()
      else public.keep_event_story_shares.created_at end
  returning created_at into v_share_at;
  return jsonb_build_object('ok',true,'eventId',p_event_id,'sharedAt',v_share_at);
end;
$fn$;

create or replace function public.keep_event_story_list(p_limit integer default 20)
returns table(
  event_id uuid,creator_id uuid,username text,event_name text,description text,
  venue_name text,image_url text,starts_at timestamptz,ends_at timestamptz,
  shared_at timestamptz,going_count bigint,maybe_count bigint,checked_in_count bigint,
  pulse_score bigint,ticket_price_cents integer
) language sql stable security definer set search_path = public, auth
as $fn$
  with viewer as (select p.is_adult from public.profiles p where p.id=auth.uid())
  select
    e.id,e.creator_id,p.username::text,e.name,e.description,e.venue_name,
    e.image_url,e.starts_at,e.ends_at,s.created_at,
    r.going_count,r.maybe_count,r.checked_in_count,
    (r.going_count*5 + r.maybe_count + r.checked_in_count*10)::bigint,
    e.ticket_price_cents
  from public.keep_event_story_shares s
  join public.events e on e.id=s.event_id and e.creator_id=s.profile_id
  join public.profiles p on p.id=e.creator_id
  cross join lateral (
    select
      count(*) filter(where status='GOING')::bigint as going_count,
      count(*) filter(where status='MAYBE')::bigint as maybe_count,
      count(*) filter(where checked_in_at is not null)::bigint as checked_in_count
    from public.event_rsvps where event_id=e.id
  ) r
  where e.is_disabled=false
    and e.moderation_status='APPROVED'
    and e.starts_at <= now()+interval '1 year'
    and coalesce(e.ends_at,e.starts_at+interval '6 hours')>now()
    and s.created_at>=now()-interval '24 hours'
    and (e.audience_mode <> 'ADULTS_18_PLUS' or coalesce((select is_adult from viewer),false))
  order by
    case when exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=e.creator_id) then 0 else 1 end,
    s.created_at desc
  limit least(greatest(coalesce(p_limit,20),1),30);
$fn$;

revoke all on function public.keep_publish_event_story(uuid) from public,anon;
grant execute on function public.keep_publish_event_story(uuid) to authenticated;
revoke all on function public.keep_event_story_list(integer) from public,anon;
grant execute on function public.keep_event_story_list(integer) to authenticated;

-- Un événement terminé disparaît du flux public. Son organisateur conserve
-- la fiche dans « Mes soirées » pour retrouver ses chiffres, billets et avis.
create or replace function public.keep_upcoming_events_for_me(p_limit integer default 100)
returns table(
  id uuid,creator_id uuid,name text,description text,venue_name text,
  starts_at timestamptz,ends_at timestamptz,country_code text,
  dj_artist_names text[],external_ticket_url text,youtube_url text,
  image_url text,image_urls text[],require_qr_code boolean,audience_mode text,
  ticket_price_cents integer,organizer_phone_public text,moderation_status text,
  photo_status text,photo_note text,text_status text,text_note text
) language sql stable security definer set search_path = public, auth
as $fn$
  with viewer as (
    select p.id,p.is_adult,p.country_code from public.profiles p where p.id=auth.uid()
  )
  select
    e.id,e.creator_id,e.name,e.description,e.venue_name,e.starts_at,e.ends_at,e.country_code,
    e.dj_artist_names,e.external_ticket_url,e.youtube_url,e.image_url,e.image_urls,e.require_qr_code,
    e.audience_mode,e.ticket_price_cents,e.organizer_phone_public,e.moderation_status::text,
    e.photo_status::text,e.photo_note,e.text_status::text,e.text_note
  from public.events e left join viewer v on true
  where e.is_disabled=false and e.moderation_status='APPROVED'
    and coalesce(e.ends_at,e.starts_at+interval '6 hours')>now()
    and (e.audience_mode <> 'ADULTS_18_PLUS' or coalesce(v.is_adult,false))
  order by
    case
      when auth.uid() is not null and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=e.creator_id) then 0
      when auth.uid() is not null and exists(select 1 from public.keep_decisions k where k.profile_id=auth.uid() and k.source_user_id=e.creator_id and k.decision='KEPT') then 1
      when v.country_code is not null and e.country_code=v.country_code then 2
      else 3 end,
    e.starts_at asc
  limit least(greatest(coalesce(p_limit,100),1),200);
$fn$;

comment on function public.keep_event_story_list(integer)
is 'Story événement 24 h : uniquement événements approuvés encore valides ; score Pulse fondé sur RSVP et billets pointés, sans FREE fictifs.';
