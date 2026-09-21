-- Adel (21/09/2026, Partie 4) : "Quand je sélectionne des morceaux pour
-- les vendre, ça doit créer une entité indépendante. Je dois pouvoir
-- ajouter d'autres morceaux à cette offre sans devoir tout supprimer et
-- recommencer. Je dois pouvoir retirer un morceau de cette offre sans
-- casser l'offre entière. L'offre garde son identité, son prix, son
-- historique."
--
-- AUDIT (comme demandé, "vérifie si déjà existante") : l'entité existe
-- déjà et est déjà indépendante -- playlist_sale_offers (identité, prix,
-- date) + playlist_sale_offer_tracks (une ligne par morceau inclus,
-- relation many-to-many). Ce qui manquait vraiment : les RPC pour ajouter/
-- retirer un morceau d'une offre EXISTANTE sans la recréer. Le prix reste
-- inchangé par ces deux opérations (jamais recalculé automatiquement --
-- Adel a laissé ça "optionnel", non fait ici : le vendeur ajuste lui-même
-- s'il le souhaite, via le prix déjà modifiable).

create or replace function public.keep_playlist_sale_add_tracks(p_offer_id uuid, p_track_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_clean_ids uuid[];
  v_added integer;
  v_total integer;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_ids is null or array_length(p_track_ids, 1) is null then raise exception 'TRACK_SELECTION_REQUIRED'; end if;

  select * into v_offer from public.playlist_sale_offers where id = p_offer_id and seller_id = uid for update;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_NOT_YOURS'; end if;
  if not v_offer.is_active then raise exception 'OFFER_NOT_ACTIVE'; end if;

  -- Même garde-fou que la création : seuls des morceaux réellement gérés
  -- par ce vendeur (playlist ou décision KEPT) peuvent rejoindre l'offre --
  -- ET (Adel, 21/09/2026, règle supplémentaire) uniquement des morceaux
  -- que ce vendeur a lui-même DÉCOUVERTS (source_user_id null dans sa
  -- propre décision KEPT), jamais un morceau récupéré socialement depuis
  -- un autre profil. "Ce n'est pas lui qui l'a découverte" -- il ne vend
  -- alors que sa propre découverte, jamais celle de quelqu'un d'autre.
  select coalesce(array_agg(distinct candidate.track_id), array[]::uuid[])
  into v_clean_ids
  from (
    select pt.track_id
    from public.playlist_tracks pt
    join public.playlists p on p.id = pt.playlist_id
    where p.owner_id = uid and pt.track_id = any(p_track_ids)
    union
    select kd.track_id
    from public.keep_decisions kd
    where kd.profile_id = uid and kd.decision = 'KEPT' and kd.track_id = any(p_track_ids)
  ) candidate
  where not exists (
    select 1 from public.keep_decisions kd2
    where kd2.profile_id = uid and kd2.track_id = candidate.track_id
      and kd2.decision = 'KEPT' and kd2.source_user_id is not null
  );

  if array_length(v_clean_ids, 1) is null then raise exception 'TRACK_SELECTION_REQUIRED'; end if;

  insert into public.playlist_sale_offer_tracks(offer_id, track_id)
  select p_offer_id, t from unnest(v_clean_ids) t
  on conflict (offer_id, track_id) do nothing;
  get diagnostics v_added = row_count;

  update public.playlist_sale_offers set updated_at = now() where id = p_offer_id;

  select count(*) into v_total from public.playlist_sale_offer_tracks where offer_id = p_offer_id;

  return jsonb_build_object('offerId', p_offer_id, 'addedCount', v_added, 'trackCount', v_total);
end;
$function$;
grant execute on function public.keep_playlist_sale_add_tracks(uuid, uuid[]) to authenticated;

create or replace function public.keep_playlist_sale_remove_track(p_offer_id uuid, p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_remaining integer;
  v_closed boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_offer from public.playlist_sale_offers where id = p_offer_id and seller_id = uid for update;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_NOT_YOURS'; end if;

  delete from public.playlist_sale_offer_tracks where offer_id = p_offer_id and track_id = p_track_id;
  if not found then raise exception 'TRACK_NOT_IN_OFFER'; end if;

  select count(*) into v_remaining from public.playlist_sale_offer_tracks where offer_id = p_offer_id;

  -- Une offre à zéro morceau n'a plus de sens -- fermée automatiquement
  -- (is_active=false), exactement comme "Supprimer l'offre" : le masquage
  -- (keep_playlist_sale_masked_track_ids ne regarde que les offres actives)
  -- redevient sans effet par construction, aucune restauration manuelle à
  -- faire. Le morceau retiré retrouve son état d'origine (public/privé)
  -- automatiquement -- il n'a jamais été modifié par la mise en vente,
  -- seulement filtré à l'affichage tant que l'offre était active.
  if v_remaining = 0 then
    update public.playlist_sale_offers set is_active = false, updated_at = now() where id = p_offer_id;
    v_closed := true;
  else
    update public.playlist_sale_offers set updated_at = now() where id = p_offer_id;
  end if;

  return jsonb_build_object('offerId', p_offer_id, 'trackCount', v_remaining, 'offerClosed', v_closed);
end;
$function$;
grant execute on function public.keep_playlist_sale_remove_track(uuid, uuid) to authenticated;

-- Correctif d'un bug latent trouvé pendant ce même audit : "Changer le
-- prix" (MyMusicScreen.tsx) videait l'offre ENTIÈRE (clearPlaylistSalePrice
-- sur tout playlist_id) puis la recréait avec UN SEUL morceau -- invisible
-- tant qu'une offre n'avait qu'un morceau (le seul cas réel observé), mais
-- aurait détruit une offre à plusieurs morceaux au premier changement de
-- prix. Cette RPC met à jour le prix d'une offre EXISTANTE sans y toucher
-- autrement -- composition et identité intactes, exactement l'esprit de
-- "l'offre garde son identité, son prix, son historique, même si je
-- modifie sa composition".
create or replace function public.keep_playlist_sale_update_price(p_offer_id uuid, p_price_cents integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  row_result public.playlist_sale_offers%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_price_cents is null or p_price_cents not in (50, 100, 200, 300, 500, 1000) then
    raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT';
  end if;

  update public.playlist_sale_offers
  set price_cents = p_price_cents, updated_at = now()
  where id = p_offer_id and seller_id = uid and is_active = true
  returning * into row_result;

  if row_result.id is null then raise exception 'OFFER_NOT_FOUND_OR_NOT_YOURS'; end if;

  return jsonb_build_object('offerId', row_result.id, 'priceCents', row_result.price_cents);
end;
$function$;
grant execute on function public.keep_playlist_sale_update_price(uuid, integer) to authenticated;

-- Notification aux abonnés -- UNIQUEMENT à la création initiale (jamais à
-- une modification, pour ne pas spammer), max 1 par vendeur par jour
-- (throttle explicite demandé par Adel).
alter table public.profiles add column if not exists last_sale_offer_broadcast_at timestamptz;

create or replace function public.keep_playlist_sale_notify_followers(p_seller_id uuid, p_offer_id uuid, p_playlist_name text, p_price_cents integer, p_currency_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_last timestamptz;
  v_follower record;
  v_seller_username text;
begin
  select last_sale_offer_broadcast_at into v_last from public.profiles where id = p_seller_id;
  if v_last is not null and v_last > now() - interval '1 day' then
    return; -- throttle : max 1 notification de ce type par vendeur par jour
  end if;

  select username into v_seller_username from public.profiles where id = p_seller_id;

  -- Adel (21/09/2026) : "les abonnés ET ceux qui ont pris la musique, même
  -- s'ils ne sont pas abonnés" -- audience élargie aux profils qui ont
  -- déjà gardé un morceau découvert par ce vendeur (source_user_id), pas
  -- seulement ses abonnés.
  for v_follower in
    select distinct recipient.id as follower_id
    from (
      select f.follower_id as id from public.follows f where f.followee_id = p_seller_id
      union
      select kd.profile_id as id from public.keep_decisions kd
      where kd.source_user_id = p_seller_id and kd.decision = 'KEPT' and kd.profile_id <> p_seller_id
    ) recipient
    left join public.notification_preferences np on np.profile_id = recipient.id
    where coalesce(np.social_enabled, true) = true
  loop
    insert into public.notifications(profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
    values (
      v_follower.follower_id,
      'PLAYLIST_SALE_OFFER_CREATED',
      '🏷️ Nouvelle découverte en vente',
      coalesce('@' || v_seller_username, 'Un profil que tu suis') || ' vient de mettre une découverte musicale en vente pour ' || (p_price_cents::numeric / 100) || ' ' || p_currency_code || '.',
      jsonb_build_object('event', 'PLAYLIST_SALE_OFFER_CREATED', 'offerId', p_offer_id, 'sellerId', p_seller_id, 'priceCents', p_price_cents, 'currencyCode', p_currency_code),
      'pending',
      0
    );
  end loop;

  update public.profiles set last_sale_offer_broadcast_at = now() where id = p_seller_id;
end;
$function$;
grant execute on function public.keep_playlist_sale_notify_followers(uuid, uuid, text, integer, text) to authenticated;

-- Branché uniquement sur la création (v2), jamais sur add/remove_track
-- ci-dessus -- c'est la garantie structurelle qu'une modification
-- n'entraîne jamais une nouvelle notification.
create or replace function public.keep_playlist_sale_set_price_for_selection_v2(
  p_track_ids uuid[],
  p_name text,
  p_price_cents integer,
  p_currency_code text default 'EUR',
  p_cover_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  access jsonb;
  clean_name text := coalesce(nullif(trim(p_name), ''), 'Sélection Loki');
  clean_currency text := upper(coalesce(nullif(trim(p_currency_code), ''), 'EUR'));
  clean_cover text := nullif(trim(coalesce(p_cover_url, '')), '');
  new_offer_id uuid := gen_random_uuid();
  clean_ids uuid[];
  row_result public.playlist_sale_offers%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_ids is null or array_length(p_track_ids, 1) is null then raise exception 'TRACK_SELECTION_REQUIRED'; end if;
  if array_length(p_track_ids, 1) > 200 then raise exception 'TRACK_SELECTION_TOO_LARGE'; end if;
  if p_price_cents is null or p_price_cents not in (50, 100, 200, 300, 500, 1000) then
    raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT';
  end if;
  if length(clean_name) > 100 then raise exception 'PLAYLIST_NAME_TOO_LONG'; end if;
  if clean_cover is not null and clean_cover !~* '^https://' then raise exception 'COVER_URL_MUST_BE_HTTPS'; end if;

  access := public.keep_playlist_sale_access();
  if not (access->>'unlocked')::boolean then raise exception 'PLAYLIST_SALE_LOCKED:%', (access->>'threshold'); end if;

  -- (Adel, 21/09/2026, règle supplémentaire) : uniquement des morceaux que
  -- ce vendeur a lui-même découverts (source_user_id null) -- jamais un
  -- morceau récupéré socialement depuis un autre profil.
  select coalesce(array_agg(distinct candidate.track_id), array[]::uuid[])
  into clean_ids
  from (
    select pt.track_id
    from public.playlist_tracks pt
    join public.playlists pl on pl.id = pt.playlist_id
    where pl.owner_id = uid and pt.track_id = any(p_track_ids)
    union
    select kd.track_id
    from public.keep_decisions kd
    where kd.profile_id = uid and kd.decision = 'KEPT' and kd.track_id = any(p_track_ids)
  ) candidate
  where not exists (
    select 1 from public.keep_decisions kd2
    where kd2.profile_id = uid and kd2.track_id = candidate.track_id
      and kd2.decision = 'KEPT' and kd2.source_user_id is not null
  );

  if array_length(clean_ids, 1) is null or array_length(clean_ids, 1) <> array_length((select array_agg(distinct x) from unnest(p_track_ids) x), 1) then
    raise exception 'TRACK_SELECTION_NOT_OWNED';
  end if;

  insert into public.playlist_sale_offers(id, seller_id, playlist_id, playlist_name, price_cents, currency_code, cover_url)
  values (new_offer_id, uid, 'keep-selection:' || new_offer_id::text, clean_name, p_price_cents, clean_currency, clean_cover)
  returning * into row_result;

  insert into public.playlist_sale_offer_tracks(offer_id, track_id)
  select new_offer_id, t from unnest(clean_ids) t;

  perform public.keep_playlist_sale_notify_followers(uid, new_offer_id, clean_name, p_price_cents, clean_currency);

  return jsonb_build_object(
    'id', row_result.id,
    'offerId', row_result.id,
    'playlistId', row_result.playlist_id,
    'playlistName', row_result.playlist_name,
    'priceCents', row_result.price_cents,
    'currencyCode', row_result.currency_code,
    'coverUrl', row_result.cover_url,
    'trackCount', array_length(clean_ids, 1)
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_set_price_for_selection_v2(uuid[], text, integer, text, text) to authenticated;
