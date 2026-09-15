-- Adel (17-18/09/2026) : "construis tout ce qui manque ... trouve une
-- solution ... essaye de prendre la main pour les clés qui te manquent"
-- -- pour l'entrée payante des soirées, la vraie solution qui ne dépend
-- d'AUCUNE clé Paddle : le même modèle déjà validé pour la vente de
-- playlists/musique ("KEEP encaisse rien"). L'organisateur colle son lien
-- de paiement personnel (déjà en place, un seul endroit pour tout),
-- l'acheteur paie directement là-dessus, l'organisateur confirme -> la
-- participation (RSVP) se débloque. Zéro dépendance à un compte tiers.
--
-- Prix en montants fixes (même principe que le marketplace, "pour éviter
-- les bugs") -- une échelle adaptée à une entrée de soirée plutôt qu'à une
-- playlist (jusqu'à 50€ au lieu de 10€).

alter table public.events add column if not exists ticket_price_cents integer;
alter table public.events drop constraint if exists events_ticket_price_preset;
alter table public.events add constraint events_ticket_price_preset
  check (ticket_price_cents is null or ticket_price_cents in (200, 500, 1000, 1500, 2000, 3000, 5000));

create table if not exists public.event_ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null,
  currency_code char(3) not null default 'EUR',
  platform_fee_cents integer not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','FAILED','REFUNDED')),
  provider text not null default 'EXTERNAL_LINK',
  created_at timestamptz not null default now(),
  unique(event_id, buyer_id, status)
);
create index if not exists event_ticket_orders_seller_idx on public.event_ticket_orders(seller_id, created_at desc);
create index if not exists event_ticket_orders_buyer_idx on public.event_ticket_orders(buyer_id, created_at desc);
alter table public.event_ticket_orders enable row level security;
drop policy if exists "event_ticket_orders_read_own" on public.event_ticket_orders;
create policy "event_ticket_orders_read_own" on public.event_ticket_orders for select using (auth.uid() = seller_id or auth.uid() = buyer_id);

create or replace function public.keep_event_set_ticket_price(p_event_id uuid, p_price_cents integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_price_cents is not null and p_price_cents not in (200, 500, 1000, 1500, 2000, 3000, 5000) then
    raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT';
  end if;
  update public.events set ticket_price_cents = p_price_cents
  where id = p_event_id and creator_id = uid;
  if not found then raise exception 'EVENT_NOT_FOUND_OR_NOT_YOURS'; end if;
end;
$function$;
grant execute on function public.keep_event_set_ticket_price(uuid, integer) to authenticated;

create or replace function public.keep_event_request_ticket_purchase(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_existing public.event_ticket_orders%rowtype;
  v_seller_username text;
  v_payout_link text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.ticket_price_cents is null then raise exception 'EVENT_IS_FREE'; end if;
  if v_event.creator_id = uid then raise exception 'CANNOT_BUY_OWN_TICKET'; end if;

  select * into v_existing from public.event_ticket_orders
  where event_id = p_event_id and buyer_id = uid and status in ('PENDING','COMPLETED')
  order by created_at desc limit 1;

  if v_existing.id is null then
    insert into public.event_ticket_orders(event_id, seller_id, buyer_id, amount_cents, currency_code, status, provider)
    values (p_event_id, v_event.creator_id, uid, v_event.ticket_price_cents, 'EUR', 'PENDING', 'EXTERNAL_LINK')
    returning * into v_existing;
  end if;

  select username into v_seller_username from public.profiles where id = v_event.creator_id;
  select payout_link into v_payout_link from public.profiles where id = v_event.creator_id;

  return jsonb_build_object(
    'orderId', v_existing.id,
    'status', v_existing.status,
    'amountCents', v_existing.amount_cents,
    'currencyCode', v_existing.currency_code,
    'sellerUsername', v_seller_username,
    'payoutLink', v_payout_link
  );
end;
$function$;
grant execute on function public.keep_event_request_ticket_purchase(uuid) to authenticated;

-- Confirmation manuelle par l'organisateur -> débloque directement la
-- participation (RSVP), pour ne jamais dépendre d'un deuxième geste côté
-- acheteur après paiement.
create or replace function public.keep_event_ticket_mark_paid(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_order public.event_ticket_orders%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  update public.event_ticket_orders set status = 'COMPLETED'
  where id = p_order_id and seller_id = uid and status = 'PENDING'
  returning * into v_order;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND_OR_NOT_YOURS'; end if;

  insert into public.event_rsvps(event_id, profile_id, status)
  values (v_order.event_id, v_order.buyer_id, 'GOING')
  on conflict (event_id, profile_id) do update set status = 'GOING';
end;
$function$;
grant execute on function public.keep_event_ticket_mark_paid(uuid) to authenticated;

create or replace function public.keep_event_ticket_my_sales()
returns table(id uuid, buyer_username text, event_name text, amount_cents integer, currency_code text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select o.id, b.username, e.name, o.amount_cents, o.currency_code, o.status, o.created_at
  from public.event_ticket_orders o
  join public.events e on e.id = o.event_id
  join public.profiles b on b.id = o.buyer_id
  where o.seller_id = auth.uid()
  order by o.created_at desc;
$function$;
grant execute on function public.keep_event_ticket_my_sales() to authenticated;

create or replace function public.keep_event_ticket_my_purchases()
returns table(id uuid, seller_username text, event_name text, amount_cents integer, currency_code text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select o.id, s.username, e.name, o.amount_cents, o.currency_code, o.status, o.created_at
  from public.event_ticket_orders o
  join public.events e on e.id = o.event_id
  join public.profiles s on s.id = o.seller_id
  where o.buyer_id = auth.uid()
  order by o.created_at desc;
$function$;
grant execute on function public.keep_event_ticket_my_purchases() to authenticated;

-- Super Admin : meme visibilite complete que pour le marketplace playlists/musique.
create or replace function public.keep_admin_event_ticket_orders(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, seller_id uuid, seller_username text, buyer_id uuid, buyer_username text, event_name text, amount_cents integer, currency_code text, platform_fee_cents integer, status text, provider text, created_at timestamptz)
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
    select o.id, o.seller_id, sp.username, o.buyer_id, bp.username, e.name, o.amount_cents,
           o.currency_code, o.platform_fee_cents, o.status, o.provider, o.created_at
    from public.event_ticket_orders o
    join public.events e on e.id = o.event_id
    join public.profiles sp on sp.id = o.seller_id
    join public.profiles bp on bp.id = o.buyer_id
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
grant execute on function public.keep_admin_event_ticket_orders(integer, integer) to authenticated;
