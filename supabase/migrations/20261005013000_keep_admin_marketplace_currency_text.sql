-- ERR-ADMIN-MARKETPLACE-CURRENCY-TYPE-085
-- Super Admin > Place de marché affichait « structure of query does not match
-- function result type » (ordinateur ET téléphone). Cause : currency_code est
-- char(3) (bpchar) dans les tables, mais les 3 RPC déclarent `currency_code text`.
-- Correctif minimal : cast explicite ::text. Signatures, sécurité (rôles
-- SUPER_ADMIN/ADMIN/FINANCE), tri et pagination inchangés. Aucune donnée modifiée.

create or replace function public.keep_admin_playlist_sale_offers(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, seller_id uuid, seller_username text, playlist_id text, playlist_name text, price_cents integer, currency_code text, is_active boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  return query
    select o.id, o.seller_id, p.username, o.playlist_id, o.playlist_name, o.price_cents, o.currency_code::text, o.is_active, o.created_at, o.updated_at
    from public.playlist_sale_offers o
    join public.profiles p on p.id = o.seller_id
    order by o.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

create or replace function public.keep_admin_playlist_sale_payments(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, seller_id uuid, seller_username text, buyer_id uuid, buyer_username text, playlist_name text, amount_cents integer, currency_code text, platform_fee_cents integer, status text, provider text, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  return query
    select pay.id, pay.seller_id, sp.username, pay.buyer_id, bp.username, o.playlist_name, pay.amount_cents, pay.currency_code::text, pay.platform_fee_cents, pay.status, pay.provider, pay.created_at
    from public.playlist_sale_payments pay
    join public.playlist_sale_offers o on o.id = pay.offer_id
    join public.profiles sp on sp.id = pay.seller_id
    join public.profiles bp on bp.id = pay.buyer_id
    order by pay.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

create or replace function public.keep_admin_event_ticket_orders(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, seller_id uuid, seller_username text, buyer_id uuid, buyer_username text, event_name text, amount_cents integer, currency_code text, platform_fee_cents integer, status text, provider text, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  return query
    select o.id, o.seller_id, sp.username, o.buyer_id, bp.username, e.name, o.amount_cents,
           o.currency_code::text, o.platform_fee_cents, o.status, o.provider, o.created_at
    from public.event_ticket_orders o
    join public.events e on e.id = o.event_id
    join public.profiles sp on sp.id = o.seller_id
    join public.profiles bp on bp.id = o.buyer_id
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
