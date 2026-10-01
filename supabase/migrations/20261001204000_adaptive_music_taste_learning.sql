-- Adaptive music taste learning.
-- Declared preferences stay in profiles.favorite_genres/favorite_artists.
-- Learned preferences are stored separately and fed by real behavior.

alter table public.profiles
  add column if not exists inferred_genres text[] not null default '{}',
  add column if not exists inferred_artists text[] not null default '{}',
  add column if not exists music_taste_updated_at timestamptz;

create table if not exists public.profile_music_taste_scores (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  taste_type text not null check (taste_type in ('GENRE','ARTIST')),
  taste_key text not null,
  display_label text not null,
  score numeric not null default 0,
  positive_signals integer not null default 0,
  negative_signals integer not null default 0,
  last_signal_at timestamptz not null default now(),
  primary key(profile_id,taste_type,taste_key)
);

create index if not exists idx_profile_music_taste_scores_rank
  on public.profile_music_taste_scores(profile_id,taste_type,score desc,last_signal_at desc);

alter table public.profile_music_taste_scores enable row level security;
drop policy if exists profile_music_taste_scores_owner_read on public.profile_music_taste_scores;
create policy profile_music_taste_scores_owner_read
  on public.profile_music_taste_scores for select
  using (profile_id=(select auth.uid()));

create or replace function public.keep_refresh_profile_music_dna(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $function$
begin
  if p_profile_id is null then return; end if;

  update public.profiles p
  set inferred_genres=coalesce((
        select array_agg(x.display_label order by x.score desc,x.last_signal_at desc,x.display_label)
        from (
          select s.display_label,s.score,s.last_signal_at
          from public.profile_music_taste_scores s
          where s.profile_id=p_profile_id
            and s.taste_type='GENRE'
            and s.score>0
          order by s.score desc,s.last_signal_at desc
          limit 24
        ) x
      ),array[]::text[]),
      inferred_artists=coalesce((
        select array_agg(x.display_label order by x.score desc,x.last_signal_at desc,x.display_label)
        from (
          select s.display_label,s.score,s.last_signal_at
          from public.profile_music_taste_scores s
          where s.profile_id=p_profile_id
            and s.taste_type='ARTIST'
            and s.score>0
          order by s.score desc,s.last_signal_at desc
          limit 24
        ) x
      ),array[]::text[]),
      music_taste_updated_at=now()
  where p.id=p_profile_id;
end;
$function$;

revoke all on function public.keep_refresh_profile_music_dna(uuid) from public,anon;
grant execute on function public.keep_refresh_profile_music_dna(uuid) to authenticated,service_role;

create or replace function public.keep_apply_track_taste_signal(
  p_profile_id uuid,
  p_track_id uuid,
  p_delta numeric,
  p_positive boolean default true
)
returns void
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_artist text;
  v_genres text[];
  v_label text;
begin
  if p_profile_id is null or p_track_id is null or p_delta=0 then return; end if;

  select nullif(trim(t.artist),''),coalesce(t.genres,array[]::text[])
    into v_artist,v_genres
  from public.tracks t
  where t.id=p_track_id;

  if not found then return; end if;

  if v_artist is not null then
    insert into public.profile_music_taste_scores(
      profile_id,taste_type,taste_key,display_label,score,positive_signals,negative_signals,last_signal_at
    ) values(
      p_profile_id,'ARTIST',lower(v_artist),v_artist,p_delta,
      case when p_positive then 1 else 0 end,
      case when p_positive then 0 else 1 end,
      now()
    )
    on conflict(profile_id,taste_type,taste_key) do update
    set score=greatest(-20,least(250,public.profile_music_taste_scores.score+excluded.score)),
        display_label=excluded.display_label,
        positive_signals=public.profile_music_taste_scores.positive_signals+excluded.positive_signals,
        negative_signals=public.profile_music_taste_scores.negative_signals+excluded.negative_signals,
        last_signal_at=now();
  end if;

  for v_label in
    select distinct trim(g)
    from unnest(v_genres) g
    where nullif(trim(g),'') is not null
    limit 8
  loop
    insert into public.profile_music_taste_scores(
      profile_id,taste_type,taste_key,display_label,score,positive_signals,negative_signals,last_signal_at
    ) values(
      p_profile_id,'GENRE',lower(v_label),v_label,p_delta,
      case when p_positive then 1 else 0 end,
      case when p_positive then 0 else 1 end,
      now()
    )
    on conflict(profile_id,taste_type,taste_key) do update
    set score=greatest(-20,least(250,public.profile_music_taste_scores.score+excluded.score)),
        display_label=excluded.display_label,
        positive_signals=public.profile_music_taste_scores.positive_signals+excluded.positive_signals,
        negative_signals=public.profile_music_taste_scores.negative_signals+excluded.negative_signals,
        last_signal_at=now();
  end loop;

  perform public.keep_refresh_profile_music_dna(p_profile_id);
end;
$function$;

revoke all on function public.keep_apply_track_taste_signal(uuid,uuid,numeric,boolean) from public,anon;
grant execute on function public.keep_apply_track_taste_signal(uuid,uuid,numeric,boolean) to authenticated,service_role;

create or replace function public.keep_music_taste_from_decision_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
begin
  if tg_op='DELETE' then
    if old.decision='KEPT' then
      perform public.keep_apply_track_taste_signal(old.profile_id,old.track_id,-8,false);
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and old.decision='KEPT' and (
      old.profile_id is distinct from new.profile_id
      or old.track_id is distinct from new.track_id
      or old.decision is distinct from new.decision
    ) then
    perform public.keep_apply_track_taste_signal(old.profile_id,old.track_id,-8,false);
  end if;

  if new.decision='KEPT' and (
      tg_op='INSERT'
      or old.profile_id is distinct from new.profile_id
      or old.track_id is distinct from new.track_id
      or old.decision is distinct from new.decision
    ) then
    perform public.keep_apply_track_taste_signal(new.profile_id,new.track_id,8,true);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_keep_music_taste_from_decision on public.keep_decisions;
create trigger trg_keep_music_taste_from_decision
after insert or update or delete on public.keep_decisions
for each row execute function public.keep_music_taste_from_decision_trigger();

create or replace function public.keep_music_taste_from_listen_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
begin
  perform public.keep_apply_track_taste_signal(new.listener_id,new.track_id,1.25,true);
  return new;
end;
$function$;

drop trigger if exists trg_keep_music_taste_from_listen on public.profile_swipe_listens;
create trigger trg_keep_music_taste_from_listen
after insert on public.profile_swipe_listens
for each row execute function public.keep_music_taste_from_listen_trigger();

create or replace function public.keep_loki_pulse_hide(p_track_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,auth
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  insert into public.profile_loki_pulse_events(profile_id,track_id,hidden_at)
  values(uid,p_track_id,now())
  on conflict(profile_id,track_id)
  do update set hidden_at=now(),last_shown_at=now();
  perform public.keep_apply_track_taste_signal(uid,p_track_id,-3,false);
  return true;
end;
$function$;

revoke all on function public.keep_loki_pulse_hide(uuid) from public,anon;
grant execute on function public.keep_loki_pulse_hide(uuid) to authenticated;

-- Historical backfill: Keeps count much more than passive listens.
insert into public.profile_music_taste_scores(
  profile_id,taste_type,taste_key,display_label,score,positive_signals,negative_signals,last_signal_at
)
select profile_id,taste_type,taste_key,max(display_label) as display_label,
       sum(score) as score,
       sum(positive_signals) as positive_signals,
       sum(negative_signals) as negative_signals,
       max(last_signal_at) as last_signal_at
from (
  select kd.profile_id,'ARTIST'::text as taste_type,lower(trim(t.artist)) as taste_key,trim(t.artist) as display_label,
         count(*)::numeric*8 as score,count(*)::integer as positive_signals,0::integer as negative_signals,max(kd.created_at) as last_signal_at
  from public.keep_decisions kd join public.tracks t on t.id=kd.track_id
  where kd.decision='KEPT' and nullif(trim(t.artist),'') is not null
  group by kd.profile_id,lower(trim(t.artist)),trim(t.artist)

  union all

  select kd.profile_id,'GENRE',lower(trim(g)),trim(g),
         count(*)::numeric*8,count(*)::integer,0::integer,max(kd.created_at)
  from public.keep_decisions kd
  join public.tracks t on t.id=kd.track_id
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where kd.decision='KEPT' and nullif(trim(g),'') is not null
  group by kd.profile_id,lower(trim(g)),trim(g)

  union all

  select l.listener_id,'ARTIST',lower(trim(t.artist)),trim(t.artist),
         count(*)::numeric*1.25,count(*)::integer,0::integer,max(l.created_at)
  from public.profile_swipe_listens l join public.tracks t on t.id=l.track_id
  where nullif(trim(t.artist),'') is not null
  group by l.listener_id,lower(trim(t.artist)),trim(t.artist)

  union all

  select l.listener_id,'GENRE',lower(trim(g)),trim(g),
         count(*)::numeric*1.25,count(*)::integer,0::integer,max(l.created_at)
  from public.profile_swipe_listens l
  join public.tracks t on t.id=l.track_id
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where nullif(trim(g),'') is not null
  group by l.listener_id,lower(trim(g)),trim(g)

  union all

  select e.profile_id,'ARTIST',lower(trim(t.artist)),trim(t.artist),
         -3::numeric,0::integer,1::integer,e.hidden_at
  from public.profile_loki_pulse_events e join public.tracks t on t.id=e.track_id
  where e.hidden_at is not null and nullif(trim(t.artist),'') is not null

  union all

  select e.profile_id,'GENRE',lower(trim(g)),trim(g),
         -3::numeric,0::integer,1::integer,e.hidden_at
  from public.profile_loki_pulse_events e
  join public.tracks t on t.id=e.track_id
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where e.hidden_at is not null and nullif(trim(g),'') is not null
) x
group by profile_id,taste_type,taste_key
on conflict(profile_id,taste_type,taste_key) do update
set score=excluded.score,
    display_label=excluded.display_label,
    positive_signals=excluded.positive_signals,
    negative_signals=excluded.negative_signals,
    last_signal_at=excluded.last_signal_at;

do $$
declare r record;
begin
  for r in
    select distinct profile_id from public.profile_music_taste_scores
  loop
    perform public.keep_refresh_profile_music_dna(r.profile_id);
  end loop;
end $$;
