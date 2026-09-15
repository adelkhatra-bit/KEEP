-- Adel (16-17/09/2026) : "on s'est mal compris ... l'utilisateur va pouvoir
-- sélectionner les musiques qu'il va vendre ou les albums complets ...
-- créer une sorte de playlist dans sa playlist" -- vendre au niveau d'UN
-- morceau ou d'UN groupe d'artiste (regroupement client, jamais une vraie
-- playlist serveur), pas seulement une playlist nommée entière. Même
-- principe légal que l'existant (curation, jamais l'audio lui-même) --
-- simple extension de granularité, réutilise 100% du masquage et du
-- paiement déjà en place.
--
-- "Assure-toi que les montants sont pré-écrits pour éviter les bugs ...
-- ça peut se vendre maximum 10 euros" -- prix desormais limites a une
-- liste fixe (0.50 a 10 euros), plus de saisie libre possible ni cote
-- serveur ni cote client.

create table if not exists public.playlist_sale_offer_tracks (
  offer_id uuid not null references public.playlist_sale_offers(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  primary key (offer_id, track_id)
);
create index if not exists playlist_sale_offer_tracks_offer_idx on public.playlist_sale_offer_tracks(offer_id);

-- Montants autorisés : 0.50 / 1 / 2 / 3 / 5 / 10 euros. Toute autre valeur
-- est rejetee -- vaut pour TOUTES les ventes (playlists nommees comprises),
-- pas seulement les nouvelles selections de morceaux/albums.
alter table public.playlist_sale_offers drop constraint if exists playlist_sale_offers_price_preset;
alter table public.playlist_sale_offers add constraint playlist_sale_offers_price_preset
  check (price_cents in (50, 100, 200, 300, 500, 1000));

create or replace function public.keep_playlist_sale_set_price_for_selection(
  p_track_ids uuid[],
  p_name text,
  p_price_cents integer,
  p_currency_code text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  access jsonb;
  clean_name text := coalesce(nullif(trim(p_name), ''), 'Sélection');
  clean_currency text := upper(coalesce(nullif(trim(p_currency_code), ''), 'EUR'));
  new_offer_id uuid := gen_random_uuid();
  clean_ids uuid[];
  row_result public.playlist_sale_offers%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_ids is null or array_length(p_track_ids, 1) is null or array_length(p_track_ids, 1) = 0 then
    raise exception 'TRACK_SELECTION_REQUIRED';
  end if;
  if p_price_cents is null or p_price_cents not in (50, 100, 200, 300, 500, 1000) then
    raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT';
  end if;
  access := public.keep_playlist_sale_access();
  if not (access->>'unlocked')::boolean then
    raise exception 'PLAYLIST_SALE_LOCKED:%', (access->>'threshold');
  end if;

  -- Ne garde que des morceaux reellement geres (evite qu'un id invalide
  -- ou d'un autre utilisateur se glisse dans la selection).
  select coalesce(array_agg(distinct pt), array[]::uuid[]) into clean_ids
  from unnest(p_track_ids) pt
  where exists (select 1 from public.tracks t where t.id = pt);
  if array_length(clean_ids, 1) is null or array_length(clean_ids, 1) = 0 then
    raise exception 'TRACK_SELECTION_REQUIRED';
  end if;

  insert into public.playlist_sale_offers(id, seller_id, playlist_id, playlist_name, price_cents, currency_code)
  values (new_offer_id, uid, 'keep-selection:' || new_offer_id::text, clean_name, p_price_cents, clean_currency)
  returning * into row_result;

  insert into public.playlist_sale_offer_tracks(offer_id, track_id)
  select new_offer_id, t from unnest(clean_ids) t;

  return jsonb_build_object(
    'id', row_result.id,
    'playlistId', row_result.playlist_id,
    'playlistName', row_result.playlist_name,
    'priceCents', row_result.price_cents,
    'currencyCode', row_result.currency_code,
    'trackCount', array_length(clean_ids, 1)
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_set_price_for_selection(uuid[], text, integer, text) to authenticated;

-- keep_playlist_sale_track_ids doit desormais aussi resoudre le prefixe
-- keep-selection: (junction table) en plus de keep-smart: et d'une vraie
-- playlist connectee -- meme fonction, un troisieme cas dans le if/else.
create or replace function public.keep_playlist_sale_track_ids(p_seller_id uuid, p_playlist_id text)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_playlist_row_id uuid;
  v_offer_id uuid;
  v_ids uuid[];
begin
  if p_seller_id is null or p_playlist_id is null or trim(p_playlist_id) = '' then return array[]::uuid[]; end if;
  if p_playlist_id like 'keep-selection:%' then
    v_offer_id := nullif(substring(p_playlist_id from 16), '')::uuid;
    if v_offer_id is null then return array[]::uuid[]; end if;
    select coalesce(array_agg(ot.track_id), array[]::uuid[]) into v_ids
    from public.playlist_sale_offer_tracks ot
    join public.playlist_sale_offers o on o.id = ot.offer_id
    where ot.offer_id = v_offer_id and o.seller_id = p_seller_id;
    return v_ids;
  end if;
  if p_playlist_id like 'keep-smart:%' then
    v_playlist_row_id := nullif(substring(p_playlist_id from 12), '')::uuid;
  else
    select id into v_playlist_row_id from public.playlists
    where owner_id = p_seller_id and provider_playlist_id = p_playlist_id
    limit 1;
  end if;
  if v_playlist_row_id is null then return array[]::uuid[]; end if;
  select coalesce(array_agg(pt.track_id), array[]::uuid[]) into v_ids
  from public.playlist_tracks pt
  join public.playlists pl on pl.id = pt.playlist_id
  where pt.playlist_id = v_playlist_row_id and pl.owner_id = p_seller_id;
  return v_ids;
exception when invalid_text_representation then
  return array[]::uuid[];
end;
$function$;
grant execute on function public.keep_playlist_sale_track_ids(uuid, text) to anon, authenticated;
