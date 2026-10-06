-- Loki Music — un même enregistrement ne peut exister que dans une seule
-- collection active d'un même vendeur. Jamais de déduplication par titre/artiste.

create or replace function public.keep_tracks_same_recording(p_a uuid,p_b uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $function$
  select case
    when p_a is null or p_b is null then false
    when p_a=p_b then true
    else coalesce((
      select
        (
          nullif(trim(coalesce(a.isrc,'')),'') is not null
          and upper(trim(a.isrc))=upper(trim(b.isrc))
        )
        or exists(
          select 1
          from jsonb_each_text(coalesce(a.provider_ids,'{}'::jsonb)) pa
          join jsonb_each_text(coalesce(b.provider_ids,'{}'::jsonb)) pb
            on lower(pa.key)=lower(pb.key)
           and pa.value=pb.value
          where lower(pa.key) in (
            'applemusic','spotify','deezer','youtube','youtubemusic',
            'musicbrainz','musicbrainzrecording'
          )
            and nullif(trim(pa.value),'') is not null
        )
      from public.tracks a
      join public.tracks b on b.id=p_b
      where a.id=p_a
    ),false)
  end;
$function$;

revoke all on function public.keep_tracks_same_recording(uuid,uuid)
from public,anon,authenticated;

-- Nettoyage des anciens doublons exacts : la collection la plus récemment
-- modifiée conserve le morceau. On retire uniquement le lien commercial ancien.
with ranked as (
  select
    ot.offer_id,
    ot.track_id,
    row_number() over(
      partition by o.seller_id,ot.track_id
      order by o.updated_at desc,o.id desc
    ) as rn
  from public.playlist_sale_offer_tracks ot
  join public.playlist_sale_offers o on o.id=ot.offer_id
  where o.is_active=true
)
delete from public.playlist_sale_offer_tracks ot
using ranked r
where r.rn>1
  and ot.offer_id=r.offer_id
  and ot.track_id=r.track_id;

create or replace function public.keep_playlist_sale_unique_active_recording_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $guard$
declare
  v_seller uuid;
  v_active boolean;
begin
  select seller_id,is_active
  into v_seller,v_active
  from public.playlist_sale_offers
  where id=new.offer_id;

  if not coalesce(v_active,false) then return new; end if;

  if exists(
    select 1
    from public.playlist_sale_offer_tracks existing
    join public.playlist_sale_offers offer on offer.id=existing.offer_id
    where offer.seller_id=v_seller
      and offer.is_active=true
      and offer.id<>new.offer_id
      and public.keep_tracks_same_recording(existing.track_id,new.track_id)
  ) then
    raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER';
  end if;

  return new;
end;
$guard$;

revoke all on function public.keep_playlist_sale_unique_active_recording_guard()
from public,anon,authenticated;

drop trigger if exists trg_playlist_sale_unique_active_recording
on public.playlist_sale_offer_tracks;
create trigger trg_playlist_sale_unique_active_recording
before insert or update of track_id,offer_id
on public.playlist_sale_offer_tracks
for each row execute function public.keep_playlist_sale_unique_active_recording_guard();

create or replace function public.keep_playlist_sale_offer_activation_unique_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $guard$
begin
  if new.is_active=true and coalesce(old.is_active,false)=false then
    if exists(
      select 1
      from public.playlist_sale_offer_tracks mine
      join public.playlist_sale_offer_tracks other_tracks
        on public.keep_tracks_same_recording(mine.track_id,other_tracks.track_id)
      join public.playlist_sale_offers other_offer
        on other_offer.id=other_tracks.offer_id
      where mine.offer_id=new.id
        and other_offer.seller_id=new.seller_id
        and other_offer.is_active=true
        and other_offer.id<>new.id
    ) then
      raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER';
    end if;
  end if;
  return new;
end;
$guard$;

revoke all on function public.keep_playlist_sale_offer_activation_unique_guard()
from public,anon,authenticated;

drop trigger if exists trg_playlist_sale_offer_activation_unique
on public.playlist_sale_offers;
create trigger trg_playlist_sale_offer_activation_unique
before update of is_active
on public.playlist_sale_offers
for each row execute function public.keep_playlist_sale_offer_activation_unique_guard();
