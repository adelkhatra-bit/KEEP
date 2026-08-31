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
      coalesce(kd.source_user_id, kd.profile_id) as origin_profile_id
    from public.keep_decisions kd, allowed
    where kd.profile_id = p_profile_id
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  )
  select
    l.track_id,
    l.origin_profile_id,
    count(d.id)::integer as recovery_count,
    count(distinct d.profile_id)::integer as unique_users
  from latest l
  left join public.keep_decisions d
    on d.track_id = l.track_id
   and d.decision = 'KEPT'
   and d.source_user_id = l.origin_profile_id
   and d.profile_id <> l.origin_profile_id
  group by l.track_id, l.origin_profile_id;
$function$;

grant execute on function public.keep_profile_discovery_impacts(uuid) to anon, authenticated;

comment on function public.keep_profile_discovery_impacts(uuid) is 'Batch discovery impact for all latest KEEP tracks of a public profile or the signed-in owner; preserves original discoverer attribution across reshares.';
