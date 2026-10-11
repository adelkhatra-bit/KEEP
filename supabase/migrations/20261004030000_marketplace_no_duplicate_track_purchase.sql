-- Loki Music — un utilisateur ne paie jamais deux fois le même contenu musical.
-- Protection serveur commune Mobile + Web.

create or replace function public.keep_playlist_sale_track_is_owned(
  p_profile_id uuid,
  p_track_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    exists (
      select 1
      from public.keep_decisions kd
      where kd.profile_id = p_profile_id
        and kd.decision = 'KEPT'
        and public.keep_tracks_same_content(kd.track_id, p_track_id)
    )
    or exists (
      select 1
      from public.playlist_tracks pt
      join public.playlists pl on pl.id = pt.playlist_id
      where pl.owner_id = p_profile_id
        and public.keep_tracks_same_content(pt.track_id, p_track_id)
    )
    or exists (
      select 1
      from public.music_library_items ml
      where ml.profile_id = p_profile_id
        and ml.removed_at is null
        and public.keep_tracks_same_content(ml.track_id, p_track_id)
    );
$function$;

create or replace function public.keep_playlist_sale_assert_no_owned_tracks(
  p_buyer_id uuid,
  p_offer_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_offer public.playlist_sale_offers%rowtype;
  v_track_ids uuid[];
  v_total integer := 0;
  v_owned integer := 0;
  v_missing integer := 0;
begin
  if p_buyer_id is null or p_offer_id is null then
    return;
  end if;

  select * into v_offer
  from public.playlist_sale_offers
  where id = p_offer_id;

  if v_offer.id is null then
    return;
  end if;

  v_track_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id, v_offer.playlist_id);
  v_total := coalesce(cardinality(v_track_ids), 0);

  if v_total = 0 then
    return;
  end if;

  select count(*)::integer
    into v_owned
  from unnest(v_track_ids) as x(track_id)
  where public.keep_playlist_sale_track_is_owned(p_buyer_id, x.track_id);

  v_missing := greatest(v_total - v_owned, 0);

  if v_owned > 0 then
    raise exception 'DUPLICATE_TRACK_PURCHASE_BLOCKED:%:%', v_owned, v_missing
      using errcode = 'P0001';
  end if;
end;
$function$;

create or replace function public.keep_guard_playlist_sale_payment_duplicate_tracks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.keep_playlist_sale_assert_no_owned_tracks(new.buyer_id, new.offer_id);
  return new;
end;
$function$;

drop trigger if exists trg_keep_guard_playlist_sale_payment_duplicate_tracks
  on public.playlist_sale_payments;

create trigger trg_keep_guard_playlist_sale_payment_duplicate_tracks
before insert on public.playlist_sale_payments
for each row
execute function public.keep_guard_playlist_sale_payment_duplicate_tracks();

create or replace function public.keep_guard_playlist_sale_bundle_item_duplicate_tracks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_buyer_id uuid;
begin
  select buyer_id into v_buyer_id
  from public.playlist_sale_payments
  where id = new.payment_id;

  perform public.keep_playlist_sale_assert_no_owned_tracks(v_buyer_id, new.offer_id);
  return new;
end;
$function$;

drop trigger if exists trg_keep_guard_playlist_sale_bundle_item_duplicate_tracks
  on public.playlist_sale_bundle_payment_items;

create trigger trg_keep_guard_playlist_sale_bundle_item_duplicate_tracks
before insert on public.playlist_sale_bundle_payment_items
for each row
execute function public.keep_guard_playlist_sale_bundle_item_duplicate_tracks();

comment on function public.keep_playlist_sale_assert_no_owned_tracks(uuid,uuid) is
  'Blocks marketplace payment when buyer already owns any equivalent music content. Use missing-track request instead.';
