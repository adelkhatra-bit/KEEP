-- Loki Music · verrou définitif contre les doublons de vente publique.
-- Une même musique d'un vendeur ne peut appartenir qu'à une seule offre publique active.
-- Les offres privées ciblées restent indépendantes.

create or replace function public.keep_prevent_duplicate_active_public_sale_track()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_seller uuid;
  v_target uuid;
  v_active boolean;
begin
  select seller_id,target_buyer_id,is_active
  into v_seller,v_target,v_active
  from public.playlist_sale_offers
  where id=new.offer_id;

  if not coalesce(v_active,false) or v_target is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.playlist_sale_offer_tracks ot
    join public.playlist_sale_offers o on o.id=ot.offer_id
    where o.seller_id=v_seller
      and o.is_active=true
      and o.target_buyer_id is null
      and ot.track_id=new.track_id
      and o.id<>new.offer_id
  ) then
    raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_prevent_duplicate_active_public_sale_track
  on public.playlist_sale_offer_tracks;
create trigger trg_prevent_duplicate_active_public_sale_track
before insert or update of offer_id,track_id
on public.playlist_sale_offer_tracks
for each row execute function public.keep_prevent_duplicate_active_public_sale_track();

create or replace function public.keep_prevent_duplicate_public_sale_reactivation()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
begin
  if not new.is_active or new.target_buyer_id is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.playlist_sale_offer_tracks mine
    join public.playlist_sale_offer_tracks other on other.track_id=mine.track_id
    join public.playlist_sale_offers o on o.id=other.offer_id
    where mine.offer_id=new.id
      and o.id<>new.id
      and o.seller_id=new.seller_id
      and o.is_active=true
      and o.target_buyer_id is null
  ) then
    raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_prevent_duplicate_public_sale_reactivation
  on public.playlist_sale_offers;
create trigger trg_prevent_duplicate_public_sale_reactivation
before insert or update of is_active,target_buyer_id
on public.playlist_sale_offers
for each row execute function public.keep_prevent_duplicate_public_sale_reactivation();

revoke all on function public.keep_prevent_duplicate_active_public_sale_track() from public,anon,authenticated;
revoke all on function public.keep_prevent_duplicate_public_sale_reactivation() from public,anon,authenticated;
