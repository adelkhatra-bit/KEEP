-- Super Admin : régler le contenu (nombre de FREE) et l'état actif des recharges FREE (achats intégrés consommables).
-- Le PRIX d'une recharge reste celui d'Apple / Google (App Store Connect / Play Console) : le Super Admin ne règle que
-- la quantité de FREE créditée après vérification serveur du reçu. Additif : aucune donnée existante n'est supprimée ni réinitialisée.
create or replace function public.admin_list_iap_free_products()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  actor_role text;
begin
  select au.role::text into actor_role from public.admin_users au where au.id = auth.uid() and au.is_active = true;
  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then raise exception 'admin_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('productId',p.product_id,'freeAmount',p.free_amount,'isActive',p.is_active) order by p.free_amount)
    from public.keep_iap_free_products p
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.admin_set_iap_free_product(p_product_id text, p_free_amount integer, p_is_active boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  actor_role text;
  old_row public.keep_iap_free_products%rowtype;
begin
  select au.role::text into actor_role from public.admin_users au where au.id = uid and au.is_active = true;
  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then raise exception 'admin_required'; end if;
  if p_free_amount is null or p_free_amount < 1 or p_free_amount > 100000 then raise exception 'invalid_free_amount'; end if;
  if p_is_active is null then raise exception 'invalid_is_active'; end if;
  select * into old_row from public.keep_iap_free_products where product_id = p_product_id for update;
  if not found then raise exception 'unknown_product'; end if;
  update public.keep_iap_free_products set free_amount = p_free_amount, is_active = p_is_active, updated_at = now() where product_id = p_product_id;
  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  values (uid, 'iap.free_product.updated', 'keep_iap_free_products', p_product_id,
    jsonb_build_object('productId',p_product_id,'freeAmount',old_row.free_amount,'isActive',old_row.is_active),
    jsonb_build_object('productId',p_product_id,'freeAmount',p_free_amount,'isActive',p_is_active));
  return jsonb_build_object('ok',true,'productId',p_product_id,'freeAmount',p_free_amount,'isActive',p_is_active);
end;
$function$;

revoke all on function public.admin_list_iap_free_products() from public, anon;
revoke all on function public.admin_set_iap_free_product(text, integer, boolean) from public, anon;
grant execute on function public.admin_list_iap_free_products() to authenticated;
grant execute on function public.admin_set_iap_free_product(text, integer, boolean) to authenticated;
