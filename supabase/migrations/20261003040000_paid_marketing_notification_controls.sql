-- Loki Music — confort notification comme avantage d'abonnement.
-- FREE garde les notifications Boutique ciblées actives.
-- PREMIUM / CREATOR_PRO / VENUE_PRO peuvent désactiver le marketing.
-- Les notifications essentielles (paiement, sécurité, messages) ne sont pas concernées.

alter table public.notification_preferences
  alter column marketing_enabled set default true;

create or replace function public.keep_notification_preferences_paid_marketing_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $guard$
declare
  v_paid boolean;
begin
  select exists(
    select 1
    from public.subscriptions s
    join public.plans pl on pl.id=s.plan_id
    where s.profile_id=new.profile_id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end>now())
      and pl.code::text in ('PREMIUM','CREATOR_PRO','VENUE_PRO')
  ) into v_paid;

  if not coalesce(v_paid,false) then
    new.marketing_enabled:=true;
  end if;
  return new;
end;
$guard$;

revoke all on function public.keep_notification_preferences_paid_marketing_guard()
from public,anon,authenticated;

drop trigger if exists trg_notification_preferences_paid_marketing_guard
on public.notification_preferences;
create trigger trg_notification_preferences_paid_marketing_guard
before insert or update of marketing_enabled
on public.notification_preferences
for each row execute function public.keep_notification_preferences_paid_marketing_guard();

-- Corrige les anciennes préférences FREE qui avaient été mises à false.
update public.notification_preferences np
set marketing_enabled=true
where marketing_enabled=false
  and not exists(
    select 1
    from public.subscriptions s
    join public.plans pl on pl.id=s.plan_id
    where s.profile_id=np.profile_id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end>now())
      and pl.code::text in ('PREMIUM','CREATOR_PRO','VENUE_PRO')
  );

create or replace function public.keep_boutique_notification_insert_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $guard$
declare
  v_seller text;
  v_paid boolean;
  v_marketing boolean:=true;
begin
  if upper(coalesce(new.type,''))<>'PLAYLIST_SALE_OFFER_CREATED' then
    return new;
  end if;

  v_seller:=nullif(coalesce(new.data->>'sellerId',''),'');
  if v_seller is null then return new; end if;

  select exists(
    select 1
    from public.subscriptions s
    join public.plans pl on pl.id=s.plan_id
    where s.profile_id=new.profile_id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end>now())
      and pl.code::text in ('PREMIUM','CREATOR_PRO','VENUE_PRO')
  ) into v_paid;

  select coalesce(np.marketing_enabled,true)
  into v_marketing
  from public.notification_preferences np
  where np.profile_id=new.profile_id;

  if coalesce(v_paid,false) and coalesce(v_marketing,true)=false then
    return null;
  end if;

  if exists(
    select 1 from public.notifications n
    where n.profile_id=new.profile_id
      and n.type='PLAYLIST_SALE_OFFER_CREATED'
      and coalesce(n.data->>'sellerId','')=v_seller
      and n.created_at>=now()-interval '24 hours'
  ) then
    return null;
  end if;

  if exists(
    select 1 from public.notifications n
    where n.profile_id=new.profile_id
      and n.type='NEW_PUBLIC_KEEP'
      and coalesce(n.data->>'ownerProfileId','')=v_seller
      and n.created_at>=now()-interval '24 hours'
  ) then
    return null;
  end if;

  return new;
end;
$guard$;

revoke all on function public.keep_boutique_notification_insert_guard()
from public,anon,authenticated;
