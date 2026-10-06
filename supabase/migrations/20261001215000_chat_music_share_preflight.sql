-- Chat music preflight:
-- - tells sender whether they can charge for a track;
-- - tells sender whether the chosen recipient already owns it;
-- - prevents targeted FREE/money offers when recipient already owns the track.

create or replace function public.keep_agora_share_preflight(
  p_track_id uuid,
  p_target_profile_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_eligibility jsonb;
  v_target_owns boolean := false;
  v_target_username text;
begin
  if uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_track_id is null then raise exception 'track_required' using errcode='22023'; end if;

  v_eligibility := public.keep_agora_my_track_sale_eligibility(p_track_id);

  if p_target_profile_id is not null then
    if p_target_profile_id=uid then raise exception 'cannot_message_self' using errcode='22023'; end if;
    select username into v_target_username
    from public.profiles
    where id=p_target_profile_id and is_public=true;
    if v_target_username is null then raise exception 'target_unavailable' using errcode='P0002'; end if;
    v_target_owns := public.keep_profile_has_track(p_target_profile_id,p_track_id);
  end if;

  return coalesce(v_eligibility,'{}'::jsonb) || jsonb_build_object(
    'targetProfileId',p_target_profile_id,
    'targetUsername',v_target_username,
    'targetOwnsTrack',v_target_owns
  );
end;
$function$;

revoke all on function public.keep_agora_share_preflight(uuid,uuid) from public,anon;
grant execute on function public.keep_agora_share_preflight(uuid,uuid) to authenticated;

create or replace function public.keep_targeted_sale_offer_track_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_target uuid;
begin
  select o.target_buyer_id into v_target
  from public.playlist_sale_offers o
  where o.id=new.offer_id;

  if v_target is not null
     and public.keep_profile_has_track(v_target,new.track_id)
  then
    raise exception 'TARGET_ALREADY_OWNS_TRACK' using errcode='23505';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_keep_targeted_sale_offer_track_guard on public.playlist_sale_offer_tracks;
create trigger trg_keep_targeted_sale_offer_track_guard
before insert or update of track_id on public.playlist_sale_offer_tracks
for each row execute function public.keep_targeted_sale_offer_track_guard();

revoke all on function public.keep_targeted_sale_offer_track_guard() from public,anon,authenticated;
