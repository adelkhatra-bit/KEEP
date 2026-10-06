-- Universal ownership guard for exclusive collection sales.
-- Sharing/reprises remain allowed, but a track that came from another profile
-- can never be inserted into a paid/FREE sale offer unless the current member
-- later rediscovers it directly (which clears social origin through the
-- existing keep_mark_direct_rediscovery flow).
create or replace function public.keep_guard_playlist_sale_track_origin()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_seller_id uuid;
begin
  select o.seller_id into v_seller_id
  from public.playlist_sale_offers o
  where o.id=new.offer_id;

  if v_seller_id is null then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.keep_decisions kd
    where kd.profile_id=v_seller_id
      and kd.track_id=new.track_id
      and kd.decision='KEPT'
      and (
        kd.source_user_id is not null
        or coalesce(kd.source_type,'')='profile'
        or nullif(coalesce(kd.context->>'sourceProfileId',''),'') is not null
        or coalesce(kd.context->>'creditPolicy','')='SOCIAL_ZERO_CREDIT'
        or coalesce(kd.context->>'source','')='marketplace_purchase'
      )
  ) then
    raise exception 'TRACK_NOT_OWN_DISCOVERY';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_playlist_sale_track_origin on public.playlist_sale_offer_tracks;
create trigger trg_guard_playlist_sale_track_origin
before insert or update of offer_id,track_id
on public.playlist_sale_offer_tracks
for each row execute function public.keep_guard_playlist_sale_track_origin();

revoke all on function public.keep_guard_playlist_sale_track_origin() from public,anon,authenticated;
