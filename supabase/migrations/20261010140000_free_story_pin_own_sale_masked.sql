-- Mise en story d'une musique gratuite/non certifiée : une musique de MA PROPRE boutique n'est plus refusée (SALE_PROTECTED),
-- elle est épinglée MASQUÉE (comme keep_pin_story_track). Seules les musiques en vente chez un AUTRE membre restent protégées.
-- Aucune donnée supprimée ; CREATE OR REPLACE uniquement.
create or replace function public.keep_pin_free_story_track(
  p_track_id uuid default null, p_title text default null, p_artist text default null, p_album text default null,
  p_artwork_url text default null, p_preview_url text default null, p_isrc text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_track uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_artist text := nullif(trim(coalesce(p_artist, '')), '');
  v_already boolean := false;
  v_certified boolean := false;
  v_own_offer boolean := false;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_track_id is not null then select id into v_track from public.tracks where id = p_track_id; end if;
  if v_track is null and nullif(trim(coalesce(p_isrc, '')), '') is not null then select id into v_track from public.tracks where isrc = trim(p_isrc); end if;
  if v_track is null and v_title is not null and v_artist is not null then
    select id into v_track from public.tracks where lower(title) = lower(v_title) and lower(artist) = lower(v_artist) order by (preview_url is not null) desc, created_at limit 1;
  end if;
  if v_track is null then
    if v_title is null or v_artist is null then raise exception 'FREE_STORY_TRACK_INVALID'; end if;
    insert into public.tracks (title, artist, album, artwork_url, preview_url, isrc, source)
    values (left(v_title, 300), left(v_artist, 300), left(nullif(trim(coalesce(p_album, '')), ''), 300), left(nullif(trim(coalesce(p_artwork_url, '')), ''), 1000), left(nullif(trim(coalesce(p_preview_url, '')), ''), 1000), nullif(trim(coalesce(p_isrc, '')), ''), 'story-free')
    returning id into v_track;
  end if;
  if exists (
    select 1 from public.playlist_sale_offer_tracks pst
    join public.playlist_sale_offers pso on pso.id = pst.offer_id
    where pst.track_id = v_track and pso.is_active = true and pso.seller_id <> uid
  ) then raise exception 'SALE_PROTECTED'; end if;
  select exists (
    select 1 from public.playlist_sale_offer_tracks pst
    join public.playlist_sale_offers pso on pso.id = pst.offer_id
    where pst.track_id = v_track and pso.is_active = true and pso.seller_id = uid
  ) into v_own_offer;
  select exists (select 1 from public.story_pins s where s.profile_id = uid and s.track_id = v_track and s.pinned_at > now() - interval '24 hours') into v_already;
  select exists (select 1 from public.keep_decisions d where d.profile_id = uid and d.track_id = v_track and d.decision = 'KEPT' and d.visibility = 'PUBLIC') into v_certified;
  if not v_already then
    insert into public.story_pins (profile_id, track_id, masked, uncertified)
    values (uid, v_track, v_own_offer, not v_certified)
    on conflict (profile_id, track_id) do update set pinned_at = now(), masked = excluded.masked, uncertified = excluded.uncertified;
  end if;
  return jsonb_build_object('trackId', v_track, 'alreadyPinned', v_already, 'uncertified', not v_certified);
end;
$function$;
