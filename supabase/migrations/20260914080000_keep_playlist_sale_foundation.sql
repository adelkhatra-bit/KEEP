-- Adel (14/09/2026) : "chaque utilisateur aura son propre Stripe ... il
-- pourra verrouiller [une playlist] et pour la deverrouiller il faudra
-- payer ... les utilisateurs pourront vendre leur playlist, et ca pour le
-- debloquer il faut un certain nombre d'abonnes ... notre plateforme
-- prendra rien du tout la-dessus pour le moment ... dans le super admin il
-- faut qu'on voit tout ce qui se passe."
--
-- Construit tout SAUF le paiement reel (Stripe Connect) : un compte
-- plateforme Stripe Connect est une demarche metier/legale reservee a Adel
-- (verification, conditions Stripe), impossible a simuler avec de fausses
-- cles -- meme principe deja applique aux evenements payants
-- (CreatorToolsPanel : "vitrine informative, pas de connexion Stripe reelle
-- tant que le systeme de paiement d'entree n'existe pas cote serveur").
--
-- Ici : le verrou par abonnes (reutilise EXACTEMENT le meme calcul de
-- followers que keep_growth_reward_status/Audience Pro), la fixation de
-- prix (reelle et fonctionnelle, sauvegardee en base), et le registre
-- Super Admin (0% de commission KEEP, colonne platform_fee_cents figee a 0
-- tant que la decision commerciale ne change pas).

create table if not exists public.playlist_sale_offers (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  playlist_id text not null,
  playlist_name text not null default '',
  price_cents integer not null check (price_cents > 0),
  currency_code char(3) not null default 'EUR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(seller_id, playlist_id)
);
create index if not exists playlist_sale_offers_seller_idx on public.playlist_sale_offers(seller_id);
alter table public.playlist_sale_offers enable row level security;
drop policy if exists "playlist_sale_offers_read_own" on public.playlist_sale_offers;
create policy "playlist_sale_offers_read_own" on public.playlist_sale_offers for select using (auth.uid() = seller_id);

-- Registre des paiements entre utilisateurs. Reste vide tant que Stripe
-- Connect n'est pas branche cote serveur -- aucune ligne ne peut etre
-- inseree par un client (aucune fonction cliente n'ecrit ici), prete a
-- recevoir les vrais evenements de paiement le jour venu.
create table if not exists public.playlist_sale_payments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.playlist_sale_offers(id) on delete cascade,
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
create index if not exists playlist_sale_payments_seller_idx on public.playlist_sale_payments(seller_id, created_at desc);
create index if not exists playlist_sale_payments_buyer_idx on public.playlist_sale_payments(buyer_id, created_at desc);
alter table public.playlist_sale_payments enable row level security;
drop policy if exists "playlist_sale_payments_read_own" on public.playlist_sale_payments;
create policy "playlist_sale_payments_read_own" on public.playlist_sale_payments for select using (auth.uid() = seller_id or auth.uid() = buyer_id);

-- Meme lecture du nombre d'abonnes que keep_growth_reward_status (follows +
-- override de test), seuil separe et propre a la vente de playlists --
-- configurable dans Super Admin > Remote Config sans toucher au code.
create or replace function public.keep_playlist_sale_access()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  follower_count integer := 0;
  override integer;
  threshold integer := 100;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select count(*)::integer into follower_count from public.follows where followee_id = uid;
  select p.follower_count_override into override from public.profiles p where p.id = uid;
  if override is not null then follower_count := override; end if;
  threshold := coalesce((select (value #>> '{}')::integer from public.remote_config where key='playlist_sale_follower_threshold' limit 1), 100);
  return jsonb_build_object(
    'followers', follower_count,
    'threshold', threshold,
    'unlocked', follower_count >= threshold
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_access() to authenticated;

create or replace function public.keep_playlist_sale_set_price(p_playlist_id text, p_playlist_name text, p_price_cents integer, p_currency_code text default 'EUR')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  access jsonb;
  row_result public.playlist_sale_offers%rowtype;
  clean_id text := nullif(trim(p_playlist_id), '');
  clean_currency text := upper(coalesce(nullif(trim(p_currency_code), ''), 'EUR'));
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if clean_id is null then raise exception 'PLAYLIST_ID_REQUIRED'; end if;
  if p_price_cents is null or p_price_cents <= 0 then raise exception 'PRICE_MUST_BE_POSITIVE'; end if;
  access := public.keep_playlist_sale_access();
  if not (access->>'unlocked')::boolean then
    raise exception 'PLAYLIST_SALE_LOCKED:%', (access->>'threshold');
  end if;
  insert into public.playlist_sale_offers(seller_id, playlist_id, playlist_name, price_cents, currency_code)
  values(uid, clean_id, coalesce(nullif(trim(p_playlist_name), ''), clean_id), p_price_cents, clean_currency)
  on conflict (seller_id, playlist_id) do update set
    playlist_name = excluded.playlist_name,
    price_cents = excluded.price_cents,
    currency_code = excluded.currency_code,
    is_active = true,
    updated_at = now()
  returning * into row_result;
  return jsonb_build_object(
    'id', row_result.id,
    'playlistId', row_result.playlist_id,
    'playlistName', row_result.playlist_name,
    'priceCents', row_result.price_cents,
    'currencyCode', row_result.currency_code,
    'isActive', row_result.is_active
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_set_price(text, text, integer, text) to authenticated;

create or replace function public.keep_playlist_sale_clear_price(p_playlist_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  update public.playlist_sale_offers set is_active = false, updated_at = now()
  where seller_id = uid and playlist_id = nullif(trim(p_playlist_id), '');
end;
$function$;
grant execute on function public.keep_playlist_sale_clear_price(text) to authenticated;

create or replace function public.keep_playlist_sale_my_offers()
returns table(playlist_id text, playlist_name text, price_cents integer, currency_code text, is_active boolean, updated_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select playlist_id, playlist_name, price_cents, currency_code, is_active, updated_at
  from public.playlist_sale_offers
  where seller_id = auth.uid()
  order by updated_at desc;
$function$;
grant execute on function public.keep_playlist_sale_my_offers() to authenticated;

-- Super Admin : "il faut qu'on voit tout ce qui se passe" -- registre
-- complet (offres actives + paiements), reserve aux roles habilites,
-- meme garde que le reste de la comptabilite Super Admin.
create or replace function public.keep_admin_playlist_sale_offers(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, seller_id uuid, seller_username text, playlist_id text, playlist_name text, price_cents integer, currency_code text, is_active boolean, created_at timestamptz, updated_at timestamptz)
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
    select o.id, o.seller_id, p.username, o.playlist_id, o.playlist_name, o.price_cents, o.currency_code, o.is_active, o.created_at, o.updated_at
    from public.playlist_sale_offers o
    join public.profiles p on p.id = o.seller_id
    order by o.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
grant execute on function public.keep_admin_playlist_sale_offers(integer, integer) to authenticated;

create or replace function public.keep_admin_playlist_sale_payments(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, seller_id uuid, seller_username text, buyer_id uuid, buyer_username text, playlist_name text, amount_cents integer, currency_code text, platform_fee_cents integer, status text, provider text, created_at timestamptz)
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
    select pay.id, pay.seller_id, sp.username, pay.buyer_id, bp.username, o.playlist_name, pay.amount_cents, pay.currency_code, pay.platform_fee_cents, pay.status, pay.provider, pay.created_at
    from public.playlist_sale_payments pay
    join public.playlist_sale_offers o on o.id = pay.offer_id
    join public.profiles sp on sp.id = pay.seller_id
    join public.profiles bp on bp.id = pay.buyer_id
    order by pay.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
grant execute on function public.keep_admin_playlist_sale_payments(integer, integer) to authenticated;
