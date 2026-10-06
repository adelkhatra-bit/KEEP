-- Immutable attribution: the first member who actually discovered a track through Listen owns the discovery attribution forever.
-- Social copies never replace it.
create table if not exists public.keep_track_first_discoveries (
  track_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  discovered_at timestamptz not null default now()
);

insert into public.keep_track_first_discoveries(track_id,profile_id,discovered_at)
select distinct on (kd.track_id) kd.track_id,kd.profile_id,kd.created_at
from public.keep_decisions kd
where kd.decision='KEPT'
  and coalesce(kd.source_type,'') <> 'profile'
  and kd.source_user_id is null
  and coalesce(kd.context->>'creditPolicy','LISTEN_KEEP') <> 'SOCIAL_ZERO_CREDIT'
order by kd.track_id,kd.created_at asc,kd.id asc
on conflict (track_id) do nothing;

create or replace function public.keep_capture_first_discovery() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.decision='KEPT' and coalesce(new.source_type,'') <> 'profile'
     and new.source_user_id is null
     and coalesce(new.context->>'creditPolicy','LISTEN_KEEP') <> 'SOCIAL_ZERO_CREDIT' then
    insert into public.keep_track_first_discoveries(track_id,profile_id,discovered_at)
    values(new.track_id,new.profile_id,new.created_at) on conflict(track_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists keep_capture_first_discovery_trg on public.keep_decisions;
create trigger keep_capture_first_discovery_trg after insert on public.keep_decisions
for each row execute function public.keep_capture_first_discovery();

create or replace function public.keep_track_first_discoveries(p_track_ids uuid[])
returns table(track_id uuid,profile_id uuid,username text,discovered_at timestamptz)
language sql stable security definer set search_path=public as $$
 select d.track_id,d.profile_id,p.username,d.discovered_at
 from public.keep_track_first_discoveries d join public.profiles p on p.id=d.profile_id
 where d.track_id=any(p_track_ids)
$$;
revoke all on function public.keep_track_first_discoveries(uuid[]) from public;
grant execute on function public.keep_track_first_discoveries(uuid[]) to authenticated,anon;