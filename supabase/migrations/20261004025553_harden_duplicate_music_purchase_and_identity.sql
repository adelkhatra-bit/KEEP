-- Loki Music — anti-doublon fort musique + marketplace (Mobile + Web)
-- Une même chanson reste la même via ISRC / Spotify / Apple Music / Deezer,
-- même si deux fournisseurs ont créé des track_id différents.

create or replace function public.keep_tracks_equivalent(p_left uuid, p_right uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  a public.tracks%rowtype;
  b public.tracks%rowtype;
  a_strong boolean;
  b_strong boolean;
begin
  if p_left is null or p_right is null then return false; end if;
  if p_left = p_right then return true; end if;

  select * into a from public.tracks where id=p_left;
  select * into b from public.tracks where id=p_right;
  if a.id is null or b.id is null then return false; end if;

  if nullif(trim(coalesce(a.isrc,'')),'') is not null
     and upper(trim(a.isrc)) = upper(trim(coalesce(b.isrc,''))) then return true; end if;
  if nullif(a.provider_ids->>'spotify','') is not null
     and (a.provider_ids->>'spotify') = (b.provider_ids->>'spotify') then return true; end if;
  if nullif(a.provider_ids->>'appleMusic','') is not null
     and (a.provider_ids->>'appleMusic') = (b.provider_ids->>'appleMusic') then return true; end if;
  if nullif(a.provider_ids->>'deezer','') is not null
     and (a.provider_ids->>'deezer') = (b.provider_ids->>'deezer') then return true; end if;

  a_strong := nullif(trim(coalesce(a.isrc,'')),'') is not null
    or nullif(a.provider_ids->>'spotify','') is not null
    or nullif(a.provider_ids->>'appleMusic','') is not null
    or nullif(a.provider_ids->>'deezer','') is not null;
  b_strong := nullif(trim(coalesce(b.isrc,'')),'') is not null
    or nullif(b.provider_ids->>'spotify','') is not null
    or nullif(b.provider_ids->>'appleMusic','') is not null
    or nullif(b.provider_ids->>'deezer','') is not null;

  if not a_strong and not b_strong
     and public.keep_track_identity(a.title,a.artist)=public.keep_track_identity(b.title,b.artist)
     and (a.duration_sec is null or b.duration_sec is null or abs(a.duration_sec-b.duration_sec) <= 8) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.keep_playlist_sale_track_is_owned(p_profile_id uuid, p_track_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  t public.tracks%rowtype;
  t_has_strong boolean;
begin
  if p_profile_id is null or p_track_id is null then return false; end if;
  select * into t from public.tracks where id=p_track_id;
  if t.id is null then return false; end if;

  if exists (
    select 1 from public.keep_decisions kd
    where kd.profile_id=p_profile_id and kd.decision='KEPT'
      and public.keep_tracks_equivalent(kd.track_id,p_track_id)
  ) then return true; end if;

  if exists (
    select 1 from public.playlist_tracks pt
    join public.playlists pl on pl.id=pt.playlist_id
    where pl.owner_id=p_profile_id
      and public.keep_tracks_equivalent(pt.track_id,p_track_id)
  ) then return true; end if;

  if exists (
    select 1 from public.music_library_items ml
    where ml.profile_id=p_profile_id and ml.removed_at is null and ml.track_id is not null
      and public.keep_tracks_equivalent(ml.track_id,p_track_id)
  ) then return true; end if;

  t_has_strong := nullif(trim(coalesce(t.isrc,'')),'') is not null
    or nullif(t.provider_ids->>'spotify','') is not null
    or nullif(t.provider_ids->>'appleMusic','') is not null
    or nullif(t.provider_ids->>'deezer','') is not null;

  if exists (
    select 1 from public.music_library_items ml
    where ml.profile_id=p_profile_id and ml.removed_at is null and ml.track_id is null
      and (
        (nullif(trim(coalesce(t.isrc,'')),'') is not null
          and upper(trim(coalesce(ml.isrc,'')))=upper(trim(t.isrc)))
        or (lower(coalesce(ml.provider,''))='spotify'
          and nullif(t.provider_ids->>'spotify','') is not null
          and ml.provider_track_id=t.provider_ids->>'spotify')
        or (lower(coalesce(ml.provider,'')) in ('apple','applemusic','apple_music')
          and nullif(t.provider_ids->>'appleMusic','') is not null
          and ml.provider_track_id=t.provider_ids->>'appleMusic')
        or (lower(coalesce(ml.provider,''))='deezer'
          and nullif(t.provider_ids->>'deezer','') is not null
          and ml.provider_track_id=t.provider_ids->>'deezer')
        or (not t_has_strong and nullif(trim(coalesce(ml.isrc,'')),'') is null
          and public.keep_track_identity(ml.title,ml.artist)=public.keep_track_identity(t.title,t.artist))
      )
  ) then return true; end if;

  return false;
end;
$$;

-- Protection de course inter-appareils. Une migration concurrente peut déjà
-- avoir créé l'équivalent sous un autre nom ; IF NOT EXISTS garde l'opération sûre.
create unique index if not exists playlist_sale_payments_one_active_per_offer_buyer_uidx
  on public.playlist_sale_payments(offer_id,buyer_id)
  where status in ('PENDING','COMPLETED');

create or replace function public.keep_guard_playlist_sale_no_owned_tracks()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_offer public.playlist_sale_offers%rowtype;
  v_ids uuid[];
  v_total integer:=0;
  v_owned integer:=0;
begin
  if new.status not in ('PENDING','COMPLETED') then return new; end if;
  select * into v_offer from public.playlist_sale_offers where id=new.offer_id;
  if v_offer.id is null then return new; end if;
  v_ids:=public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id);
  v_total:=coalesce(cardinality(v_ids),0);
  if v_total=0 then return new; end if;
  select count(*)::integer into v_owned
  from unnest(v_ids) x(track_id)
  where public.keep_playlist_sale_track_is_owned(new.buyer_id,x.track_id);
  if v_owned>0 then raise exception 'DUPLICATE_TRACK_PURCHASE_BLOCKED:%:%',v_owned,v_total; end if;
  return new;
end;
$$;

drop trigger if exists keep_guard_playlist_sale_no_owned_tracks_trg on public.playlist_sale_payments;
create trigger keep_guard_playlist_sale_no_owned_tracks_trg
before insert on public.playlist_sale_payments
for each row execute function public.keep_guard_playlist_sale_no_owned_tracks();

create or replace function public.keep_guard_playlist_sale_bundle_item_no_owned_tracks()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_ids uuid[];
  v_total integer:=0;
  v_owned integer:=0;
begin
  select * into v_payment from public.playlist_sale_payments where id=new.payment_id;
  if v_payment.id is null then return new; end if;
  select * into v_offer from public.playlist_sale_offers where id=new.offer_id;
  if v_offer.id is null then return new; end if;
  v_ids:=public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id);
  v_total:=coalesce(cardinality(v_ids),0);
  if v_total=0 then return new; end if;
  select count(*)::integer into v_owned
  from unnest(v_ids) x(track_id)
  where public.keep_playlist_sale_track_is_owned(v_payment.buyer_id,x.track_id);
  if v_owned>0 then raise exception 'DUPLICATE_TRACK_PURCHASE_BLOCKED:%:%',v_owned,v_total; end if;
  return new;
end;
$$;

drop trigger if exists keep_guard_playlist_sale_bundle_item_no_owned_tracks_trg on public.playlist_sale_bundle_payment_items;
create trigger keep_guard_playlist_sale_bundle_item_no_owned_tracks_trg
before insert on public.playlist_sale_bundle_payment_items
for each row execute function public.keep_guard_playlist_sale_bundle_item_no_owned_tracks();
