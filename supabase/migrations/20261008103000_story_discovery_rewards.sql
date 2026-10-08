-- Issue #63, points 4–6 : réglages et événements futurs seulement.
insert into public.remote_config(key,value,description,updated_at)
values
  ('first_discovery_free_per_keep','3'::jsonb,'FREE au premier découvreur pour le GARDER d’un autre membre.',now()),
  ('first_discovery_monthly_free_cap','20'::jsonb,'Plafond mensuel FREE du premier découvreur.',now())
on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=now();

-- L’attribution existe avant le GARDER et sa récompense, dans la même transaction.
-- Un partage sans GARDER n’attribue rien ; une reprise ne remplace jamais l’origine.
create or replace function public.keep_capture_first_discovery()
returns trigger language plpgsql security definer set search_path=public as $$
declare origin uuid;
begin
  if new.decision <> 'KEPT' then return new; end if;
  if coalesce(new.context->>'creditPolicy','LISTEN_KEEP') = 'LISTEN_KEEP'
     and coalesce(new.context->>'source','') <> 'marketplace_purchase' then
    insert into public.keep_track_first_discoveries(track_id,profile_id,discovered_at)
    values(new.track_id,new.profile_id,new.created_at)
    on conflict(track_id) do nothing;
  end if;
  select profile_id into origin from public.keep_track_first_discoveries where track_id=new.track_id;
  if origin is not null then
    new.source_user_id := case when origin <> new.profile_id then origin else null end;
    new.source_type := case when origin <> new.profile_id then 'profile' else null end;
  end if;
  return new;
end $$;
revoke all on function public.keep_capture_first_discovery() from public,anon,authenticated;
drop trigger if exists keep_capture_first_discovery_trg on public.keep_decisions;
create trigger keep_capture_first_discovery_trg before insert on public.keep_decisions
for each row execute function public.keep_capture_first_discovery();

create or replace function public.keep_reward_first_discoverer_on_keep()
returns trigger language plpgsql security definer set search_path=public as $$
declare discoverer uuid; cap integer; reward integer; month_reward integer;
begin
  if new.decision <> 'KEPT' then return new; end if;
  select profile_id into discoverer from public.keep_track_first_discoveries where track_id=new.track_id;
  if discoverer is null or discoverer=new.profile_id then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('first-discovery-reward:'||discoverer::text,0));
  if exists(select 1 from public.keep_first_discovery_credit_events
            where keeper_profile_id=new.profile_id and track_id=new.track_id) then return new; end if;
  cap := greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='first_discovery_monthly_free_cap'),20));
  reward := greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='first_discovery_free_per_keep'),3));
  select coalesce(sum(amount),0)::integer into month_reward
  from public.keep_first_discovery_credit_events
  where first_discoverer_id=discoverer and created_at>=date_trunc('month',now());
  reward := least(reward,greatest(0,cap-month_reward));
  if reward=0 then return new; end if;
  insert into public.keep_first_discovery_credit_events(first_discoverer_id,keeper_profile_id,track_id,keep_decision_id,amount)
  values(discoverer,new.profile_id,new.track_id,new.id,reward)
  on conflict(keep_decision_id) do nothing;
  if found then
    insert into public.keep_free_economy_events(profile_id,amount,event_type,source_key,metadata)
    values(discoverer,reward,'FIRST_DISCOVERY_KEEP','FIRST_DISCOVERY:'||new.id::text,
      jsonb_build_object('trackId',new.track_id,'keeperProfileId',new.profile_id,'keepDecisionId',new.id))
    on conflict(profile_id,source_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.keep_reward_first_discoverer_on_keep() from public,anon,authenticated;

-- Le RPC v4 garde sa signature ; compteurs issus exclusivement des sessions existantes.
-- La colonne est déjà utilisée par la v4 appliquée en production ; clones anciens : ajout vide.
alter table public.story_watch_sessions add column if not exists playback_progress jsonb not null default '{}'::jsonb;
create or replace function public.keep_my_story_viewers_v4(
  p_track_id text default null,p_published_at timestamptz default null
)
returns table(viewer_id uuid,username text,avatar_url text,viewed_at timestamptz,seconds integer,
  tracks_seen integer,tracks_total integer,listened boolean,watching boolean,left_at timestamptz,
  is_follower boolean,is_reprise boolean,chapters jsonb,playback_progress jsonb)
language sql stable security definer set search_path=public as $$
  with sessions as (
    select s.* from public.story_watch_sessions s
    where s.owner_id=auth.uid() and s.viewer_id<>auth.uid()
      and s.started_at>now()-interval '24 hours'
      and s.started_at>=coalesce(
        (select min(p.pinned_at) from public.story_pins p where p.profile_id=auth.uid() and p.pinned_at>now()-interval '24 hours'),
        (select max(p.pinned_at) from public.story_pins p where p.profile_id=auth.uid()),'-infinity'::timestamptz)
      and (p_track_id is null or (p_published_at is not null and s.started_at>=p_published_at
        and s.playback_progress->'publications' ? p_track_id
        and replace(s.playback_progress->'publications'->>p_track_id,'+00:00','Z')
          =to_char(p_published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  ), latest as (
    select distinct on (s.viewer_id) s.* from sessions s order by s.viewer_id,s.started_at desc,s.id desc
  )
  select s.viewer_id,p.username,p.avatar_url,s.started_at,s.seconds,s.tracks_seen,s.tracks_total,
    s.listened,s.ended_at is null and s.last_ping_at>now()-interval '25 seconds',
    coalesce(s.ended_at,s.last_ping_at),
    exists(select 1 from public.follows f where f.follower_id=s.viewer_id and f.followee_id=auth.uid()),
    exists(select 1 from public.keep_decisions d where d.profile_id=s.viewer_id and d.decision='KEPT' and d.source_user_id=auth.uid()),
    s.chapters,coalesce(s.playback_progress,'{}'::jsonb)||jsonb_build_object(
      'touch_count',(select count(*) from sessions c where c.viewer_id=s.viewer_id),'last_track_id',s.last_track_id)
  from latest s join public.profiles p on p.id=s.viewer_id order by s.started_at desc limit 200
$$;
revoke all on function public.keep_my_story_viewers_v4(text,timestamptz) from public,anon;
grant execute on function public.keep_my_story_viewers_v4(text,timestamptz) to authenticated,service_role;
