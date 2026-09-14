-- Adel (14/09/2026) : "comment va se passer pour qu'un utilisateur puisse
-- faire payer ses musiques, ses albums" -- distinct de la marketplace de
-- playlists (20260914080000+) qui vend de la CURATION sur des morceaux
-- externes. Ici c'est l'artiste qui vend SA PROPRE creation (droits a lui),
-- donc aucun risque de requalification en revendeur de musique -- au
-- contraire du systeme de playlists, le fichier audio original est bien le
-- produit vendu, legitimement, comme Bandcamp.
--
-- "Fait le mieux, regarde la concurrence" -> modele Bandcamp repris :
-- prix fixe OU "nom ton prix" avec minimum, extrait ecoutable librement,
-- version complete jamais livree tant que le paiement reel n'existe pas.
--
-- Construit tout SAUF le paiement reel (Stripe Connect), meme principe deja
-- applique a la marketplace de playlists : le registre de commandes reste
-- vide, aucune fonction cliente n'y ecrit, pret a recevoir les vrais
-- evenements de paiement le jour venu.
--
-- Reserve aux formules CREATOR_PRO / VENUE_PRO (regle deja en vigueur :
-- "DJ / Artiste / Createur / Producteur ... exigent CREATOR_PRO"), sans
-- palier d'abonnes -- contrairement a la vente de playlists, vendre sa
-- propre musique n'a pas besoin d'audience prealable pour etre legitime.

do $$
begin
  if to_regnamespace('storage') is null then
    raise notice 'storage schema absent: artist track storage migration skipped in plain PostgreSQL CI';
    return;
  end if;

  -- Bucket public : uniquement l'extrait promotionnel + la pochette. Jamais
  -- le fichier complet -- on ne peut pas donner gratuitement ce qui doit
  -- etre vendu.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('artist-track-previews', 'artist-track-previews', true, 15728640, array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','image/jpeg','image/png','image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists "artist_track_previews_public_read" on storage.objects';
  execute 'create policy "artist_track_previews_public_read" on storage.objects for select using (bucket_id = ''artist-track-previews'')';

  execute 'drop policy if exists "artist_track_previews_own_insert" on storage.objects';
  execute 'create policy "artist_track_previews_own_insert" on storage.objects for insert to authenticated with check (bucket_id = ''artist-track-previews'' and (storage.foldername(name))[1] = auth.uid()::text)';

  execute 'drop policy if exists "artist_track_previews_own_update" on storage.objects';
  execute 'create policy "artist_track_previews_own_update" on storage.objects for update to authenticated using (bucket_id = ''artist-track-previews'' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = ''artist-track-previews'' and (storage.foldername(name))[1] = auth.uid()::text)';

  execute 'drop policy if exists "artist_track_previews_own_delete" on storage.objects';
  execute 'create policy "artist_track_previews_own_delete" on storage.objects for delete to authenticated using (bucket_id = ''artist-track-previews'' and (storage.foldername(name))[1] = auth.uid()::text)';

  -- Bucket prive : le fichier complet. L'artiste peut le deposer maintenant
  -- (pret pour le jour ou le paiement reel existera) mais AUCUNE policy de
  -- lecture publique n'existe -- meme pas pour un "acheteur", puisqu'il n'y
  -- a aucun moyen de verifier un vrai paiement pour l'instant.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('artist-track-masters', 'artist-track-masters', false, 104857600, array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/flac','audio/x-flac'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists "artist_track_masters_owner_read" on storage.objects';
  execute 'create policy "artist_track_masters_owner_read" on storage.objects for select to authenticated using (bucket_id = ''artist-track-masters'' and (storage.foldername(name))[1] = auth.uid()::text)';

  execute 'drop policy if exists "artist_track_masters_owner_insert" on storage.objects';
  execute 'create policy "artist_track_masters_owner_insert" on storage.objects for insert to authenticated with check (bucket_id = ''artist-track-masters'' and (storage.foldername(name))[1] = auth.uid()::text)';

  execute 'drop policy if exists "artist_track_masters_owner_update" on storage.objects';
  execute 'create policy "artist_track_masters_owner_update" on storage.objects for update to authenticated using (bucket_id = ''artist-track-masters'' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = ''artist-track-masters'' and (storage.foldername(name))[1] = auth.uid()::text)';

  execute 'drop policy if exists "artist_track_masters_owner_delete" on storage.objects';
  execute 'create policy "artist_track_masters_owner_delete" on storage.objects for delete to authenticated using (bucket_id = ''artist-track-masters'' and (storage.foldername(name))[1] = auth.uid()::text)';
end $$;

create table if not exists public.artist_original_tracks (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  album_name text,
  pricing_mode text not null default 'FIXED' check (pricing_mode in ('FIXED','PAY_WHAT_YOU_WANT')),
  price_cents integer not null check (price_cents > 0),
  min_price_cents integer check (min_price_cents is null or min_price_cents > 0),
  currency_code char(3) not null default 'EUR',
  preview_storage_path text not null,
  cover_storage_path text,
  master_storage_path text,
  rights_confirmed boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_original_tracks_pwyw_floor check (
    pricing_mode <> 'PAY_WHAT_YOU_WANT' or (min_price_cents is not null and min_price_cents <= price_cents)
  )
);
create index if not exists artist_original_tracks_seller_idx on public.artist_original_tracks(seller_id);
alter table public.artist_original_tracks enable row level security;
drop policy if exists "artist_original_tracks_read_own" on public.artist_original_tracks;
create policy "artist_original_tracks_read_own" on public.artist_original_tracks for select using (auth.uid() = seller_id);

-- Registre des commandes. Reste vide tant que Stripe Connect n'est pas
-- branche cote serveur -- aucune fonction cliente n'y ecrit, exactement
-- comme playlist_sale_payments.
create table if not exists public.artist_track_orders (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.artist_original_tracks(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null,
  currency_code char(3) not null default 'EUR',
  platform_fee_cents integer not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','FAILED','REFUNDED')),
  provider text not null default 'STRIPE_CONNECT',
  provider_payment_id text,
  created_at timestamptz not null default now()
);
create index if not exists artist_track_orders_seller_idx on public.artist_track_orders(seller_id, created_at desc);
create index if not exists artist_track_orders_buyer_idx on public.artist_track_orders(buyer_id, created_at desc);
alter table public.artist_track_orders enable row level security;
drop policy if exists "artist_track_orders_read_own" on public.artist_track_orders;
create policy "artist_track_orders_read_own" on public.artist_track_orders for select using (auth.uid() = seller_id or auth.uid() = buyer_id);

-- Meme regle deja en vigueur ("DJ / Artiste / Createur / Producteur ...
-- exigent CREATOR_PRO") : pas de palier d'abonnes ici, juste la formule.
create or replace function public.keep_artist_track_access()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  code text := 'FREE';
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select pl.code into code
  from public.subscriptions s
  join public.plans pl on pl.id = s.plan_id
  where s.profile_id = uid
    and s.status in ('TRIALING','ACTIVE')
    and (s.current_period_end is null or s.current_period_end > now())
  order by s.created_at desc
  limit 1;
  code := coalesce(code, 'FREE');
  return jsonb_build_object('planCode', code, 'unlocked', code in ('CREATOR_PRO','VENUE_PRO'));
end;
$function$;
grant execute on function public.keep_artist_track_access() to authenticated;

create or replace function public.keep_artist_track_upsert(
  p_track_id uuid,
  p_title text,
  p_album_name text,
  p_pricing_mode text,
  p_price_cents integer,
  p_min_price_cents integer,
  p_currency_code text,
  p_preview_storage_path text,
  p_cover_storage_path text,
  p_master_storage_path text,
  p_rights_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  access jsonb;
  row_result public.artist_original_tracks%rowtype;
  clean_title text := nullif(trim(p_title), '');
  clean_mode text := upper(coalesce(nullif(trim(p_pricing_mode), ''), 'FIXED'));
  clean_currency text := upper(coalesce(nullif(trim(p_currency_code), ''), 'EUR'));
  clean_preview text := nullif(trim(p_preview_storage_path), '');
begin
  if uid is null then raise exception 'authentication_required'; end if;
  access := public.keep_artist_track_access();
  if not (access->>'unlocked')::boolean then
    raise exception 'ARTIST_TRACK_SALE_REQUIRES_CREATOR_PRO';
  end if;
  if clean_title is null then raise exception 'TITLE_REQUIRED'; end if;
  if clean_preview is null then raise exception 'PREVIEW_REQUIRED'; end if;
  if p_price_cents is null or p_price_cents <= 0 then raise exception 'PRICE_MUST_BE_POSITIVE'; end if;
  if clean_mode not in ('FIXED','PAY_WHAT_YOU_WANT') then raise exception 'INVALID_PRICING_MODE'; end if;
  if clean_mode = 'PAY_WHAT_YOU_WANT' and (p_min_price_cents is null or p_min_price_cents <= 0 or p_min_price_cents > p_price_cents) then
    raise exception 'INVALID_MINIMUM_PRICE';
  end if;
  if coalesce(p_rights_confirmed, false) is not true then raise exception 'RIGHTS_CONFIRMATION_REQUIRED'; end if;
  -- Un chemin de stockage doit toujours commencer par le dossier de son
  -- propre uid (deja impose par les policies storage, revalide ici pour ne
  -- jamais accepter le chemin d'un autre utilisateur).
  if clean_preview !~ ('^' || uid::text || '/') then raise exception 'PREVIEW_PATH_MUST_BELONG_TO_SELLER'; end if;
  if p_cover_storage_path is not null and nullif(trim(p_cover_storage_path), '') is not null and p_cover_storage_path !~ ('^' || uid::text || '/') then
    raise exception 'COVER_PATH_MUST_BELONG_TO_SELLER';
  end if;
  if p_master_storage_path is not null and nullif(trim(p_master_storage_path), '') is not null and p_master_storage_path !~ ('^' || uid::text || '/') then
    raise exception 'MASTER_PATH_MUST_BELONG_TO_SELLER';
  end if;

  if p_track_id is not null then
    update public.artist_original_tracks set
      title = clean_title,
      album_name = nullif(trim(p_album_name), ''),
      pricing_mode = clean_mode,
      price_cents = p_price_cents,
      min_price_cents = case when clean_mode = 'PAY_WHAT_YOU_WANT' then p_min_price_cents else null end,
      currency_code = clean_currency,
      preview_storage_path = clean_preview,
      cover_storage_path = nullif(trim(p_cover_storage_path), ''),
      master_storage_path = nullif(trim(p_master_storage_path), ''),
      rights_confirmed = true,
      is_active = true,
      updated_at = now()
    where id = p_track_id and seller_id = uid
    returning * into row_result;
    if row_result.id is null then raise exception 'TRACK_NOT_FOUND'; end if;
  else
    insert into public.artist_original_tracks(
      seller_id, title, album_name, pricing_mode, price_cents, min_price_cents,
      currency_code, preview_storage_path, cover_storage_path, master_storage_path, rights_confirmed
    ) values (
      uid, clean_title, nullif(trim(p_album_name), ''), clean_mode, p_price_cents,
      case when clean_mode = 'PAY_WHAT_YOU_WANT' then p_min_price_cents else null end,
      clean_currency, clean_preview, nullif(trim(p_cover_storage_path), ''), nullif(trim(p_master_storage_path), ''), true
    ) returning * into row_result;
  end if;

  return jsonb_build_object(
    'id', row_result.id,
    'title', row_result.title,
    'albumName', row_result.album_name,
    'pricingMode', row_result.pricing_mode,
    'priceCents', row_result.price_cents,
    'minPriceCents', row_result.min_price_cents,
    'currencyCode', row_result.currency_code,
    'previewStoragePath', row_result.preview_storage_path,
    'coverStoragePath', row_result.cover_storage_path,
    'hasMaster', row_result.master_storage_path is not null,
    'isActive', row_result.is_active
  );
end;
$function$;
grant execute on function public.keep_artist_track_upsert(uuid, text, text, text, integer, integer, text, text, text, text, boolean) to authenticated;

create or replace function public.keep_artist_track_clear(p_track_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  update public.artist_original_tracks set is_active = false, updated_at = now()
  where id = p_track_id and seller_id = uid;
end;
$function$;
grant execute on function public.keep_artist_track_clear(uuid) to authenticated;

create or replace function public.keep_artist_track_my_uploads()
returns table(
  id uuid, title text, album_name text, pricing_mode text, price_cents integer,
  min_price_cents integer, currency_code text, preview_storage_path text,
  cover_storage_path text, has_master boolean, is_active boolean, updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select id, title, album_name, pricing_mode, price_cents, min_price_cents, currency_code,
         preview_storage_path, cover_storage_path, master_storage_path is not null, is_active, updated_at
  from public.artist_original_tracks
  where seller_id = auth.uid()
  order by updated_at desc;
$function$;
grant execute on function public.keep_artist_track_my_uploads() to authenticated;

-- Vitrine publique sur le profil : le prix et l'extrait sont visibles de
-- tous (extrait = promo assumee), jamais le master.
create or replace function public.keep_artist_track_offers_for_profile(p_profile_id uuid)
returns table(
  id uuid, title text, album_name text, pricing_mode text, price_cents integer,
  min_price_cents integer, currency_code text, preview_storage_path text, cover_storage_path text
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select id, title, album_name, pricing_mode, price_cents, min_price_cents, currency_code,
         preview_storage_path, cover_storage_path
  from public.artist_original_tracks
  where seller_id = p_profile_id and is_active = true and rights_confirmed = true
  order by updated_at desc;
$function$;
grant execute on function public.keep_artist_track_offers_for_profile(uuid) to authenticated, anon;

create or replace function public.keep_admin_artist_track_uploads(p_limit integer default 100, p_offset integer default 0)
returns table(
  id uuid, seller_id uuid, seller_username text, title text, album_name text,
  pricing_mode text, price_cents integer, min_price_cents integer, currency_code text,
  has_master boolean, rights_confirmed boolean, is_active boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  return query
    select t.id, t.seller_id, p.username, t.title, t.album_name, t.pricing_mode, t.price_cents,
           t.min_price_cents, t.currency_code, t.master_storage_path is not null, t.rights_confirmed,
           t.is_active, t.created_at, t.updated_at
    from public.artist_original_tracks t
    join public.profiles p on p.id = t.seller_id
    order by t.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
grant execute on function public.keep_admin_artist_track_uploads(integer, integer) to authenticated;

create or replace function public.keep_admin_artist_track_orders(p_limit integer default 100, p_offset integer default 0)
returns table(
  id uuid, seller_id uuid, seller_username text, buyer_id uuid, buyer_username text,
  track_title text, amount_cents integer, currency_code text, platform_fee_cents integer,
  status text, provider text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  return query
    select o.id, o.seller_id, sp.username, o.buyer_id, bp.username, t.title, o.amount_cents,
           o.currency_code, o.platform_fee_cents, o.status, o.provider, o.created_at
    from public.artist_track_orders o
    join public.artist_original_tracks t on t.id = o.track_id
    join public.profiles sp on sp.id = o.seller_id
    join public.profiles bp on bp.id = o.buyer_id
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
grant execute on function public.keep_admin_artist_track_orders(integer, integer) to authenticated;
