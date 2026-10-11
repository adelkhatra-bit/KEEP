-- Loki Music worldwide catalog expansion.
-- Global baseline = every known genre + every ISO country.
-- User preference combinations are promoted to the front of the queue.
create table if not exists public.keep_world_catalog_expansion_queue (
  id bigserial primary key,
  seed_key text not null unique,
  query text not null,
  country_code text,
  priority integer not null default 100,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','RETRY','DONE')),
  attempts integer not null default 0 check (attempts >= 0),
  result_count integer not null default 0 check (result_count >= 0),
  request_id bigint,
  next_attempt_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.keep_world_catalog_expansion_queue enable row level security;
revoke all on public.keep_world_catalog_expansion_queue from anon, authenticated;

create index if not exists idx_keep_world_catalog_queue_next
on public.keep_world_catalog_expansion_queue(status,priority,next_attempt_at,updated_at);

-- Every taxonomy style gets at least one discovery search.
insert into public.keep_world_catalog_expansion_queue(seed_key,query,country_code,priority)
select
  'genre:' || genre_key,
  label,
  null,
  case when is_featured then 40 else 120 end
from public.music_genre_catalog
where nullif(trim(label),'') is not null
on conflict(seed_key) do update
set query=excluded.query,
    priority=least(public.keep_world_catalog_expansion_queue.priority,excluded.priority),
    updated_at=now();

-- Every country gets a local storefront discovery search.
insert into public.keep_world_catalog_expansion_queue(seed_key,query,country_code,priority)
select
  'country:' || upper(code),
  trim(name) || ' music',
  upper(code),
  60
from public.music_country_catalog
where code ~ '^[A-Za-z]{2}$'
  and nullif(trim(name),'') is not null
on conflict(seed_key) do update
set query=excluded.query,
    country_code=excluded.country_code,
    priority=least(public.keep_world_catalog_expansion_queue.priority,excluded.priority),
    updated_at=now();

-- Shared high-priority targets inferred from real user taste.
create or replace function public.keep_enqueue_world_catalog_for_profile(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_genres text[];
  v_countries text[];
  v_genre text;
  v_country text;
  v_count integer := 0;
begin
  if p_profile_id is null then return 0; end if;

  select
    (select array_agg(distinct x) from (
      select trim(g) x
      from unnest(coalesce(p.favorite_genres,array[]::text[]) || coalesce(p.inferred_genres,array[]::text[])) g
      where nullif(trim(g),'') is not null
      limit 8
    ) q),
    (select array_agg(distinct upper(x)) from (
      select trim(c) x
      from unnest(coalesce(p.music_country_codes,array[]::text[])) c
      where trim(c) ~ '^[A-Za-z]{2}$'
      limit 5
    ) q)
  into v_genres,v_countries
  from public.profiles p
  where p.id=p_profile_id;

  v_genres := coalesce(v_genres,array[]::text[]);
  v_countries := coalesce(v_countries,array[]::text[]);

  -- Genre-only targets become urgent even when no country was selected.
  foreach v_genre in array v_genres loop
    insert into public.keep_world_catalog_expansion_queue(seed_key,query,country_code,priority,status,next_attempt_at)
    values('taste:' || md5(lower(v_genre)),v_genre,null,8,'PENDING',null)
    on conflict(seed_key) do update
    set priority=least(public.keep_world_catalog_expansion_queue.priority,8),
        status=case when public.keep_world_catalog_expansion_queue.status='DONE' then 'DONE' else 'PENDING' end,
        next_attempt_at=null,
        updated_at=now();
    v_count := v_count + 1;

    foreach v_country in array v_countries loop
      insert into public.keep_world_catalog_expansion_queue(seed_key,query,country_code,priority,status,next_attempt_at)
      values(
        'taste:' || upper(v_country) || ':' || md5(lower(v_genre)),
        v_genre,
        upper(v_country),
        4,
        'PENDING',
        null
      )
      on conflict(seed_key) do update
      set priority=least(public.keep_world_catalog_expansion_queue.priority,4),
          status=case when public.keep_world_catalog_expansion_queue.status='DONE' then 'DONE' else 'PENDING' end,
          next_attempt_at=null,
          updated_at=now();
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$function$;
revoke all on function public.keep_enqueue_world_catalog_for_profile(uuid) from public,anon;
grant execute on function public.keep_enqueue_world_catalog_for_profile(uuid) to authenticated,service_role;

create or replace function public.keep_world_catalog_profile_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
begin
  perform public.keep_enqueue_world_catalog_for_profile(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_profiles_world_catalog_preferences on public.profiles;
create trigger trg_profiles_world_catalog_preferences
after update of favorite_genres,inferred_genres,music_country_codes on public.profiles
for each row
when (
  old.favorite_genres is distinct from new.favorite_genres
  or old.inferred_genres is distinct from new.inferred_genres
  or old.music_country_codes is distinct from new.music_country_codes
)
execute function public.keep_world_catalog_profile_trigger();

-- Bulk service-role ingestion. Existing canonical RPC owns identity/dedup.
create or replace function public.service_world_catalog_ingest(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  item jsonb;
  v_id uuid;
  v_seen integer := 0;
  v_ids uuid[] := array[]::uuid[];
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'ITEMS_ARRAY_REQUIRED';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_id := public.service_catalog_track_from_recognition(
        nullif(item->>'title',''),
        nullif(item->>'artist',''),
        nullif(item->>'isrc',''),
        nullif(item->>'album',''),
        nullif(item->>'artworkUrl',''),
        nullif(item->>'previewUrl',''),
        coalesce(item->'providerIds','{}'::jsonb),
        coalesce(item->'externalUrls','{}'::jsonb),
        coalesce(array(select jsonb_array_elements_text(coalesce(item->'availableOn','[]'::jsonb))),array[]::text[]),
        coalesce(array(select jsonb_array_elements_text(coalesce(item->'genres','[]'::jsonb))),array[]::text[]),
        case when coalesce(item->>'releaseYear','') ~ '^[0-9]{4}$' then (item->>'releaseYear')::smallint else null end
      );
      if v_id is not null then
        v_seen := v_seen + 1;
        if not v_id=any(v_ids) then v_ids := array_append(v_ids,v_id); end if;
      end if;
    exception when others then
      -- One malformed provider row must never abort the whole discovery batch.
      continue;
    end;
  end loop;

  return jsonb_build_object(
    'accepted',v_seen,
    'distinctTracks',coalesce(cardinality(v_ids),0)
  );
end;
$function$;
revoke all on function public.service_world_catalog_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.service_world_catalog_ingest(jsonb) to service_role;

create or replace function public.service_world_catalog_finish(
  p_id bigint,
  p_ok boolean,
  p_result_count integer default 0,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $function$
begin
  update public.keep_world_catalog_expansion_queue
  set status=case when p_ok then 'DONE'
                  when attempts >= 5 then 'DONE'
                  else 'RETRY' end,
      result_count=greatest(0,coalesce(p_result_count,0)),
      attempts=attempts+case when p_ok then 0 else 1 end,
      next_attempt_at=case when p_ok or attempts >= 5 then null
                           else now() + make_interval(mins => least(1440,15 * greatest(1,attempts+1))) end,
      last_finished_at=now(),
      last_error=case when p_ok then null else left(coalesce(p_error,'unknown'),500) end,
      updated_at=now()
  where id=p_id;
end;
$function$;
revoke all on function public.service_world_catalog_finish(bigint,boolean,integer,text) from public,anon,authenticated;
grant execute on function public.service_world_catalog_finish(bigint,boolean,integer,text) to service_role;

do $$
declare v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='keep_world_catalog_cron_key'
  limit 1;

  if nullif(v_secret,'') is null then
    v_secret := encode(gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'keep_world_catalog_cron_key','Loki worldwide catalog expansion key');
  end if;

  insert into public.keep_internal_worker_secrets(name,secret_hash)
  values('world-catalog-cron',encode(digest(v_secret,'sha256'),'hex'))
  on conflict(name) do update set secret_hash=excluded.secret_hash,updated_at=now();
end $$;

create or replace function public.keep_enqueue_world_catalog_expansion()
returns bigint
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_id bigint;
  v_secret text;
  v_request_id bigint;
begin
  select q.id into v_id
  from public.keep_world_catalog_expansion_queue q
  where (
    q.status='PENDING'
    or (q.status='RETRY' and coalesce(q.next_attempt_at,now())<=now())
    or (q.status='PROCESSING' and q.last_started_at<now()-interval '20 minutes')
  )
  order by q.priority,q.updated_at,q.id
  limit 1
  for update skip locked;

  if v_id is null then return null; end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='keep_world_catalog_cron_key'
  limit 1;
  if nullif(v_secret,'') is null then raise exception 'WORLD_CATALOG_CRON_SECRET_MISSING'; end if;

  update public.keep_world_catalog_expansion_queue
  set status='PROCESSING',last_started_at=now(),updated_at=now()
  where id=v_id;

  select net.http_get(
    url := 'https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-world-catalog-expand',
    params := jsonb_build_object('target',v_id),
    headers := jsonb_build_object('x-keep-cron-key',v_secret),
    timeout_milliseconds := 55000
  ) into v_request_id;

  update public.keep_world_catalog_expansion_queue
  set request_id=v_request_id,updated_at=now()
  where id=v_id;

  return v_request_id;
end;
$function$;
revoke all on function public.keep_enqueue_world_catalog_expansion() from public,anon,authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='keep-world-catalog-expand-every-two-minutes';

select cron.schedule(
  'keep-world-catalog-expand-every-two-minutes',
  '*/2 * * * *',
  'select public.keep_enqueue_world_catalog_expansion();'
);

-- Existing users immediately promote their own tastes into the queue.
do $$
declare r record;
begin
  for r in
    select id from public.profiles
    where cardinality(coalesce(favorite_genres,array[]::text[]))>0
       or cardinality(coalesce(inferred_genres,array[]::text[]))>0
       or cardinality(coalesce(music_country_codes,array[]::text[]))>0
  loop
    perform public.keep_enqueue_world_catalog_for_profile(r.id);
  end loop;
end $$;
