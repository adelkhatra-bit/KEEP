-- Loki Music — dedupe NEW_PUBLIC_KEEP by recipient + track identity.
-- Distinct tracks must stay distinct even when the visible masked copy is identical.
-- The same track should not notify the same recipient multiple times within 24h,
-- even when several profiles make that track public.

create or replace function public.loki_dedupe_new_public_keep_by_track()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_track_id text := nullif(coalesce(new.data->>'trackId', new.data->>'track_id', ''), '');
  v_lock_key text;
begin
  if upper(coalesce(new.type,'')) <> 'NEW_PUBLIC_KEEP' or v_track_id is null then
    return new;
  end if;

  v_lock_key := new.profile_id::text || ':NEW_PUBLIC_KEEP:' || v_track_id;
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  if exists (
    select 1
    from public.notifications n
    where n.profile_id = new.profile_id
      and upper(coalesce(n.type,'')) = 'NEW_PUBLIC_KEEP'
      and coalesce(n.data->>'trackId', n.data->>'track_id', '') = v_track_id
      and n.created_at >= now() - interval '24 hours'
  ) then
    return null;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_loki_dedupe_new_public_keep_by_track on public.notifications;
create trigger trg_loki_dedupe_new_public_keep_by_track
before insert on public.notifications
for each row
execute function public.loki_dedupe_new_public_keep_by_track();

create index if not exists notifications_new_public_keep_track_recent_idx
on public.notifications (
  profile_id,
  (coalesce(data->>'trackId', data->>'track_id')),
  created_at desc
)
where type = 'NEW_PUBLIC_KEEP';

with ranked as (
  select
    id,
    row_number() over (
      partition by profile_id, coalesce(data->>'trackId', data->>'track_id')
      order by created_at asc, id asc
    ) as rn
  from public.notifications
  where type = 'NEW_PUBLIC_KEEP'
    and created_at >= now() - interval '24 hours'
    and nullif(coalesce(data->>'trackId', data->>'track_id', ''), '') is not null
)
delete from public.notifications n
using ranked r
where n.id = r.id
  and r.rn > 1;
