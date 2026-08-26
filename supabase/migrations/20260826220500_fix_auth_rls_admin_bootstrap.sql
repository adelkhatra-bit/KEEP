-- KEEP auth hotfix — 2026-08-26
-- 1) Les policies admin ne doivent jamais appeler is_admin() pour le rôle anon.
-- 2) pgcrypto vit dans `extensions` sur Supabase hébergé, mais peut être dans
--    `public` dans le PostgreSQL de CI : le search_path couvre les deux.

-- PROFILES : la lecture publique reste assurée par profiles_select_own_or_public.
-- Le bypass admin ne s'évalue que pour une vraie session authentifiée.
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select to authenticated
  using (public.is_admin(auth.uid()));

-- Même correction pour les policies d'écriture admin : ne jamais exécuter
-- is_admin() sous le rôle anon, auquel l'exécution de cette fonction est
-- volontairement interdite par le hardening sécurité.
drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists plan_prices_admin_write on public.plan_prices;
create policy plan_prices_admin_write on public.plan_prices
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists plan_entitlements_admin_write on public.plan_entitlements;
create policy plan_entitlements_admin_write on public.plan_entitlements
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists subscriptions_admin_write on public.subscriptions;
create policy subscriptions_admin_write on public.subscriptions
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists usage_limits_admin_write on public.usage_limits;
create policy usage_limits_admin_write on public.usage_limits
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create or replace function public.consume_admin_bootstrap_token(p_email text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  token_row public.admin_bootstrap_tokens%rowtype;
  admin_id uuid;
begin
  select * into token_row
  from public.admin_bootstrap_tokens
  where lower(email)=lower(trim(p_email))
  for update;

  if token_row.email is null
     or token_row.used_at is not null
     or token_row.expires_at <= now()
     or crypt(p_password, token_row.password_hash) <> token_row.password_hash then
    return null;
  end if;

  select au.id into admin_id
  from public.admin_users au
  join auth.users u on u.id=au.id
  where lower(u.email)=lower(trim(p_email))
    and au.is_active=true
    and au.role='SUPER_ADMIN'
  limit 1;

  if admin_id is null then return null; end if;

  update public.admin_bootstrap_tokens
  set used_at=now()
  where lower(email)=lower(trim(p_email));

  return admin_id;
end;
$$;

revoke all on function public.consume_admin_bootstrap_token(text,text) from public, anon, authenticated;
grant execute on function public.consume_admin_bootstrap_token(text,text) to service_role;
