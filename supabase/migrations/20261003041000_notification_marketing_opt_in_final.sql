-- Loki Music — consentement marketing final.
-- Aucun plan ne peut forcer une notification promotionnelle.
-- Les comptes FREE forcés à true par la migration précédente sont remis à OFF.

drop trigger if exists trg_notification_preferences_paid_marketing_guard
  on public.notification_preferences;
drop function if exists public.keep_notification_preferences_paid_marketing_guard();

alter table public.notification_preferences
  alter column marketing_enabled set default false;

update public.notification_preferences np
set marketing_enabled=false,
    updated_at=now()
where not exists (
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
  v_marketing boolean := false;
begin
  if upper(coalesce(new.type,''))<>'PLAYLIST_SALE_OFFER_CREATED' then
    return new;
  end if;

  v_seller:=nullif(coalesce(new.data->>'sellerId',''),'');
  if v_seller is null then return new; end if;

  select coalesce(np.marketing_enabled,false)
  into v_marketing
  from public.notification_preferences np
  where np.profile_id=new.profile_id;

  if not coalesce(v_marketing,false) then
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
