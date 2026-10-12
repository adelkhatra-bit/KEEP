-- Lot 5 Super Admin > Argent > Boutique (12/10/2026).
-- FICHIER SEULEMENT : application en production soumise à l'accord explicite d'Adel.
-- Additif : 3 nouvelles RPC SECURITY DEFINER, contrôle de rôle via admin_users,
-- journal d'audit (audit_logs) pour l'action d'écriture. Aucun DELETE/DROP/TRUNCATE.
-- « Retirer » = is_active=false (réversible via la même RPC), jamais de suppression.
--
-- Rôles : SUPER_ADMIN, ADMIN, FINANCE (les mêmes que les RPC Ventes existantes).
-- Réversible : drop function des 3 fonctions ci-dessous (aucune donnée créée).
--
-- Vérification (lecture, connecté en admin) :
--   select public.keep_admin_boutique_overview();
--   select * from public.keep_admin_playlist_sale_payments_detail(20,0);
--   -- l'écriture se teste sur une offre de test :
--   -- select public.keep_admin_playlist_sale_set_active('<offer_id>', false, 'test');

create or replace function public.keep_admin_boutique_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  result jsonb;
begin
  if v_uid is null or not public.admin_has_role(v_uid, array['SUPER_ADMIN','ADMIN','FINANCE']) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'activeOffers', (select count(*) from public.playlist_sale_offers where is_active),
    'inactiveOffers', (select count(*) from public.playlist_sale_offers where not is_active),
    'sellers', (select count(distinct seller_id) from public.playlist_sale_offers where is_active),
    'profiles', (select count(*) from public.profiles),
    'emptyBoutiques', (select count(*) from public.profiles p where not exists (select 1 from public.playlist_sale_offers o where o.seller_id=p.id and o.is_active)),
    'freePayments', (select count(*) from public.playlist_sale_payments where coalesce(amount_free,0) > 0 and status='COMPLETED'),
    'freeVolume', (select coalesce(sum(amount_free),0) from public.playlist_sale_payments where coalesce(amount_free,0) > 0 and status='COMPLETED'),
    'moneyPayments', (select count(*) from public.playlist_sale_payments where amount_cents > 0 and status='COMPLETED'),
    'moneyVolumeCents', (select coalesce(sum(amount_cents),0) from public.playlist_sale_payments where amount_cents > 0 and status='COMPLETED'),
    'marketplaceFlagEnabled', coalesce((select is_enabled_globally from public.feature_flags where key='playlist_marketplace'), false)
  ) into result;
  return result;
end;
$function$;

create or replace function public.keep_admin_playlist_sale_payments_detail(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, seller_username text, buyer_username text, playlist_name text, amount_cents integer, amount_free integer, currency_code text, platform_fee_cents integer, status text, provider text, payment_mode text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.admin_has_role(v_uid, array['SUPER_ADMIN','ADMIN','FINANCE']) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  return query
    select pay.id, sp.username, bp.username, o.playlist_name, pay.amount_cents, coalesce(pay.amount_free,0), pay.currency_code::text,
           pay.platform_fee_cents, pay.status, pay.provider, o.payment_mode, pay.created_at
    from public.playlist_sale_payments pay
    join public.playlist_sale_offers o on o.id = pay.offer_id
    join public.profiles sp on sp.id = pay.seller_id
    join public.profiles bp on bp.id = pay.buyer_id
    order by pay.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

create or replace function public.keep_admin_playlist_sale_set_active(p_offer_id uuid, p_active boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_before jsonb;
begin
  if v_uid is null or not public.admin_has_role(v_uid, array['SUPER_ADMIN','ADMIN','FINANCE']) then
    raise exception 'finance_admin_required' using errcode='42501';
  end if;
  select to_jsonb(o) into v_before from public.playlist_sale_offers o where o.id = p_offer_id;
  if v_before is null then raise exception 'offer_not_found'; end if;
  update public.playlist_sale_offers set is_active = coalesce(p_active, false), updated_at = now() where id = p_offer_id;
  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  values (v_uid,
          case when coalesce(p_active,false) then 'playlist_sale.offer_restored' else 'playlist_sale.offer_suspended' end,
          'playlist_sale_offer', p_offer_id::text, v_before,
          jsonb_build_object('is_active', coalesce(p_active,false), 'reason', left(coalesce(p_reason,''), 300)));
  return jsonb_build_object('offerId', p_offer_id, 'isActive', coalesce(p_active,false));
end;
$function$;

revoke all on function public.keep_admin_boutique_overview() from public, anon;
revoke all on function public.keep_admin_playlist_sale_payments_detail(integer, integer) from public, anon;
revoke all on function public.keep_admin_playlist_sale_set_active(uuid, boolean, text) from public, anon;
grant execute on function public.keep_admin_boutique_overview() to authenticated;
grant execute on function public.keep_admin_playlist_sale_payments_detail(integer, integer) to authenticated;
grant execute on function public.keep_admin_playlist_sale_set_active(uuid, boolean, text) to authenticated;
