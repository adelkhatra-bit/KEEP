-- ECONOMIE FREE 04/10/2026 — recharges IAP consommables, serveur autoritaire.
create table if not exists public.keep_iap_free_products (
  product_id text primary key,
  free_amount integer not null check(free_amount > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.keep_iap_free_products(product_id,free_amount,is_active,updated_at)
values
  ('com.adelkhatra.keep.free.30',30,true,now()),
  ('com.adelkhatra.keep.free.100',100,true,now()),
  ('com.adelkhatra.keep.free.300',300,true,now())
on conflict(product_id) do update
set free_amount=excluded.free_amount,is_active=excluded.is_active,updated_at=now();

alter table public.keep_iap_free_products enable row level security;
drop policy if exists keep_iap_free_products_read on public.keep_iap_free_products;
create policy keep_iap_free_products_read
  on public.keep_iap_free_products for select
  to authenticated
  using(is_active=true);

create table if not exists public.keep_iap_consumable_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check(platform in ('ios','android')),
  product_id text not null references public.keep_iap_free_products(product_id),
  transaction_id text not null,
  free_amount integer not null check(free_amount > 0),
  raw_receipt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(platform,transaction_id)
);
create index if not exists idx_keep_iap_consumable_profile_time
  on public.keep_iap_consumable_transactions(profile_id,created_at desc);

alter table public.keep_iap_consumable_transactions enable row level security;
drop policy if exists keep_iap_consumable_select_own on public.keep_iap_consumable_transactions;
create policy keep_iap_consumable_select_own
  on public.keep_iap_consumable_transactions for select
  to authenticated
  using(profile_id=(select auth.uid()));

revoke insert,update,delete on public.keep_iap_consumable_transactions from public,anon,authenticated;
revoke insert,update,delete on public.keep_iap_free_products from public,anon,authenticated;

create or replace function public.service_credit_iap_free_purchase(
  p_profile_id uuid,
  p_platform text,
  p_product_id text,
  p_transaction_id text,
  p_raw_receipt jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_platform text:=lower(trim(coalesce(p_platform,'')));
  v_product text:=trim(coalesce(p_product_id,''));
  v_transaction text:=left(trim(coalesce(p_transaction_id,'')),512);
  v_amount integer:=0;
  v_inserted uuid;
  v_existing record;
  v_balance integer:=0;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id) then
    raise exception 'PROFILE_REQUIRED';
  end if;
  if v_platform not in ('ios','android') then raise exception 'IAP_PLATFORM_INVALID'; end if;
  if v_product='' or v_transaction='' then raise exception 'IAP_TRANSACTION_INVALID'; end if;

  select free_amount into v_amount
  from public.keep_iap_free_products
  where product_id=v_product and is_active=true;
  if v_amount is null or v_amount<=0 then raise exception 'IAP_FREE_PRODUCT_UNKNOWN'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_platform||':'||v_transaction,0));

  select * into v_existing
  from public.keep_iap_consumable_transactions
  where platform=v_platform and transaction_id=v_transaction;

  if found then
    if v_existing.profile_id<>p_profile_id or v_existing.product_id<>v_product then
      raise exception 'IAP_TRANSACTION_ALREADY_CLAIMED';
    end if;
    v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
    return jsonb_build_object(
      'ok',true,'alreadyGranted',true,'freeAmount',v_existing.free_amount,
      'productId',v_existing.product_id,'transactionId',v_existing.transaction_id,
      'balance',v_balance
    );
  end if;

  insert into public.keep_iap_consumable_transactions(
    profile_id,platform,product_id,transaction_id,free_amount,raw_receipt
  ) values(
    p_profile_id,v_platform,v_product,v_transaction,v_amount,coalesce(p_raw_receipt,'{}'::jsonb)
  ) returning id into v_inserted;

  insert into public.keep_free_economy_events(profile_id,amount,event_type,source_key,metadata)
  values(
    p_profile_id,
    v_amount,
    'IAP_RECHARGE',
    'IAP_RECHARGE:'||v_platform||':'||v_transaction,
    jsonb_build_object(
      'productId',v_product,
      'platform',v_platform,
      'transactionId',v_transaction,
      'iapTransactionRowId',v_inserted
    )
  )
  on conflict(profile_id,source_key) do nothing;

  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
  return jsonb_build_object(
    'ok',true,'alreadyGranted',false,'freeAmount',v_amount,
    'productId',v_product,'transactionId',v_transaction,'balance',v_balance
  );
end;
$function$;

revoke all on function public.service_credit_iap_free_purchase(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.service_credit_iap_free_purchase(uuid,text,text,text,jsonb) to service_role;
