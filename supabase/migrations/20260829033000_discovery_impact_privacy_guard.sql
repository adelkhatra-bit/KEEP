create or replace function public.keep_profile_discovery_impacts(p_profile_id uuid)
returns table(track_id uuid, origin_profile_id uuid, recovery_count integer, unique_users integer)
language sql
stable
security definer
set search_path to 'public','auth'
as $function$
  with allowed as (
    select 1
    where p_profile_id is not null
      and (
        auth.uid() = p_profile_id
        or exists (select 1 from public.profiles p where p.id = p_profile_id and p.is_public = true)
      )
  ), latest as (
    select distinct on (kd.track_id)
      kd.track_id,
      coalesce(kd.source_user_id, kd.profile_id) as origin_profile_id,
      kd.visibility::text as visibility
    from public.keep_decisions kd, allowed
    where kd.profile_id = p_profile_id
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  ), visible as (
    select l.track_id, l.origin_profile_id
    from latest l
    where auth.uid() = p_profile_id or l.visibility = 'PUBLIC'
  )
  select
    v.track_id,
    v.origin_profile_id,
    count(d.id)::integer as recovery_count,
    count(distinct d.profile_id)::integer as unique_users
  from visible v
  left join public.keep_decisions d
    on d.track_id = v.track_id
   and d.decision = 'KEPT'
   and d.source_user_id = v.origin_profile_id
   and d.profile_id <> v.origin_profile_id
  group by v.track_id, v.origin_profile_id;
$function$;

create or replace function public.keep_track_discovery_impact(p_track_id uuid, p_origin_profile_id uuid)
returns table(recovery_count integer, unique_users integer)
language sql
stable
security definer
set search_path to 'public','auth'
as $function$
  with permitted as (
    select 1
    where auth.uid() = p_origin_profile_id
       or exists (
         select 1
         from public.keep_decisions kd
         join public.profiles p on p.id = kd.profile_id
         where kd.profile_id = p_origin_profile_id
           and kd.track_id = p_track_id
           and kd.decision = 'KEPT'
           and kd.visibility = 'PUBLIC'
           and p.is_public = true
         order by kd.created_at desc, kd.id desc
         limit 1
       )
  )
  select
    count(kd.id)::integer,
    count(distinct kd.profile_id)::integer
  from public.keep_decisions kd, permitted
  where kd.decision = 'KEPT'
    and kd.track_id = p_track_id
    and kd.source_user_id = p_origin_profile_id
    and kd.profile_id <> p_origin_profile_id;
$function$;

comment on function public.keep_profile_discovery_impacts(uuid) is 'Batch discovery impact; visitors only receive public KEEP track ids while the owner can inspect own private tracks.';
comment on function public.keep_track_discovery_impact(uuid, uuid) is 'Discovery impact for one track, restricted to the origin owner or a currently public KEEP.';
