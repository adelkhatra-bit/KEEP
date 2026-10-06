-- Canonical chat ownership: detect the same song across provider/import UUIDs.
create or replace function public.keep_profile_has_track(p_profile_id uuid, p_track_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $function$
  with wanted as (
    select public.keep_track_identity(t.title,t.artist) ident
    from public.tracks t where t.id=p_track_id
  )
  select coalesce(
    exists(
      select 1
      from public.keep_decisions kd
      join public.tracks kt on kt.id=kd.track_id
      join wanted w on public.keep_track_identity(kt.title,kt.artist)=w.ident
      where kd.profile_id=p_profile_id
        and kd.decision='KEPT'
    )
    or exists(
      select 1
      from public.playlist_tracks pt
      join public.playlists pl on pl.id=pt.playlist_id
      join public.tracks kt on kt.id=pt.track_id
      join wanted w on public.keep_track_identity(kt.title,kt.artist)=w.ident
      where pl.owner_id=p_profile_id
    ),
    false
  );
$function$;

create or replace function public.keep_profile_can_resell_track(p_profile_id uuid, p_track_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $function$
  with wanted as (
    select public.keep_track_identity(t.title,t.artist) ident
    from public.tracks t where t.id=p_track_id
  ),
  owned as (
    select kd.source_user_id,kd.context
    from public.keep_decisions kd
    join public.tracks kt on kt.id=kd.track_id
    join wanted w on public.keep_track_identity(kt.title,kt.artist)=w.ident
    where kd.profile_id=p_profile_id and kd.decision='KEPT'
  )
  select case
    when exists(select 1 from owned where source_user_id is not null) then false
    when exists(
      select 1 from owned
      where source_user_id is null
        and coalesce(context->>'source','') not in (
          'marketplace_purchase','public_profile','public_profile_swipe','agora_purchase','chat_purchase'
        )
    ) then true
    else false
  end;
$function$;

revoke all on function public.keep_profile_has_track(uuid,uuid) from public,anon;
grant execute on function public.keep_profile_has_track(uuid,uuid) to authenticated,service_role;
revoke all on function public.keep_profile_can_resell_track(uuid,uuid) from public,anon;
grant execute on function public.keep_profile_can_resell_track(uuid,uuid) to authenticated,service_role;
