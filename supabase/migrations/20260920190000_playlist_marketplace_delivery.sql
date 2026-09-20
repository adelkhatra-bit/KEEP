-- Livraison réelle des sélections achetées.
--
-- Avant cette migration, la confirmation du vendeur ne faisait que démasquer
-- les titres sur son profil. L'acheteur ne recevait aucune playlist dans sa
-- propre bibliothèque Loki et le profil public envoyait parfois playlist_id
-- à une RPC qui attend l'UUID de l'offre.

alter table public.playlist_sale_offers
  add column if not exists cover_url text;

alter table public.playlist_sale_payments
  add column if not exists delivered_playlist_id uuid references public.playlists(id) on delete set null,
  add column if not exists delivered_at timestamptz;

create table if not exists public.playlist_sale_provider_deliveries (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.playlist_sale_payments(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('spotify', 'deezer')),
  provider_playlist_id text,
  status text not null default 'PENDING' check (status in ('PENDING', 'SYNCING', 'COMPLETE', 'ERROR')),
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_id, provider)
);

alter table public.playlist_sale_provider_deliveries enable row level security;
drop policy if exists playlist_sale_provider_deliveries_read_parties on public.playlist_sale_provider_deliveries;
create policy playlist_sale_provider_deliveries_read_parties
on public.playlist_sale_provider_deliveries for select to authenticated
using (
  buyer_id = (select auth.uid())
  or exists (
    select 1 from public.playlist_sale_payments p
    where p.id = payment_id and p.seller_id = (select auth.uid())
  )
);

create index if not exists idx_playlist_sale_provider_deliveries_buyer
  on public.playlist_sale_provider_deliveries(buyer_id, created_at desc);

-- Nouvelle version explicite : évite un overload ambigu de l'ancienne RPC.
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

  -- Un vendeur ne peut inclure que des titres réellement présents dans sa
  -- bibliothèque Loki (playlist ou décision KEPT), jamais un UUID arbitraire.
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
  ) candidate;

  if array_length(clean_ids, 1) is null or array_length(clean_ids, 1) <> array_length((select array_agg(distinct x) from unnest(p_track_ids) x), 1) then
    raise exception 'TRACK_SELECTION_NOT_OWNED';
  end if;

  insert into public.playlist_sale_offers(id, seller_id, playlist_id, playlist_name, price_cents, currency_code, cover_url)
  values (new_offer_id, uid, 'keep-selection:' || new_offer_id::text, clean_name, p_price_cents, clean_currency, clean_cover)
  returning * into row_result;

  insert into public.playlist_sale_offer_tracks(offer_id, track_id)
  select new_offer_id, t from unnest(clean_ids) t;

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

-- Le contrat public expose enfin l'UUID réel de l'offre, ainsi qu'une
-- présentation complète et non encombrante (jaquette + nombre de titres).
drop function if exists public.keep_playlist_sale_offers_for_profile(uuid);
create function public.keep_playlist_sale_offers_for_profile(p_profile_id uuid)
returns table(
  offer_id uuid,
  playlist_id text,
  playlist_name text,
  price_cents integer,
  currency_code text,
  cover_url text,
  track_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    o.id,
    o.playlist_id,
    o.playlist_name,
    o.price_cents,
    o.currency_code::text,
    coalesce(
      o.cover_url,
      (select t.artwork_url
       from unnest(public.keep_playlist_sale_track_ids(o.seller_id, o.playlist_id)) tid
       join public.tracks t on t.id = tid
       where nullif(t.artwork_url, '') is not null
       limit 1)
    ),
    cardinality(public.keep_playlist_sale_track_ids(o.seller_id, o.playlist_id))::integer
  from public.playlist_sale_offers o
  where o.seller_id = p_profile_id and o.is_active = true
  order by o.updated_at desc;
$function$;
grant execute on function public.keep_playlist_sale_offers_for_profile(uuid) to anon, authenticated;

-- Confirmation idempotente + livraison atomique dans la bibliothèque Loki de
-- l'acheteur. La synchronisation Spotify/Deezer est ensuite faite par le
-- backend, avec cette playlist comme source unique.
create or replace function public.keep_playlist_sale_mark_paid_and_deliver(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_playlist_id uuid;
  v_track_ids uuid[];
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and seller_id = uid
  for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.status not in ('PENDING', 'COMPLETED') then raise exception 'PAYMENT_NOT_DELIVERABLE'; end if;

  select * into v_offer from public.playlist_sale_offers where id = v_payment.offer_id;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND'; end if;
  v_track_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id, v_offer.playlist_id);
  if cardinality(v_track_ids) = 0 then raise exception 'OFFER_HAS_NO_TRACKS'; end if;

  select id into v_playlist_id
  from public.playlists
  where owner_id = v_payment.buyer_id
    and provider = 'loki_marketplace'
    and provider_playlist_id = 'purchase:' || v_payment.id::text
  limit 1;

  if v_playlist_id is null then
    insert into public.playlists(owner_id, provider, provider_playlist_id, name, description, is_public, is_smart, cover_url)
    values (
      v_payment.buyer_id,
      'loki_marketplace',
      'purchase:' || v_payment.id::text,
      v_offer.playlist_name,
      'Playlist achetée sur Loki',
      false,
      false,
      v_offer.cover_url
    )
    returning id into v_playlist_id;
  end if;

  insert into public.playlist_tracks(playlist_id, track_id, added_via)
  select v_playlist_id, track_id, 'MARKETPLACE_PURCHASE'
  from unnest(v_track_ids) track_id
  on conflict (playlist_id, track_id) do nothing;

  update public.playlist_sale_payments
  set status = 'COMPLETED', delivered_playlist_id = v_playlist_id, delivered_at = coalesce(delivered_at, now())
  where id = v_payment.id;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'buyerId', v_payment.buyer_id,
    'playlistId', v_playlist_id,
    'playlistName', v_offer.playlist_name,
    'trackCount', cardinality(v_track_ids),
    'deliveredAt', now()
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid) to authenticated;

