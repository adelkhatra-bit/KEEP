-- Include FREE marketplace collection purchases in the daily spend breakdown shown on profile.
create or replace function public.keep_free_spent_today(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
  v_keep_spent integer := 0;
  v_keep_count integer := 0;
  v_marketplace_spent integer := 0;
  v_marketplace_purchases integer := 0;
  v_total_spent integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_local_start := date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start := v_local_start at time zone v_tz;
  v_end := (v_local_start+interval '1 day') at time zone v_tz;

  select coalesce(sum(e.amount),0)::integer,
         count(*)::integer
    into v_keep_spent,v_keep_count
  from public.keep_free_spend_events e
  where e.profile_id=uid
    and e.reason='KEEP_PROFILE'
    and e.created_at>=v_start
    and e.created_at<v_end;

  select coalesce(sum(greatest(0,p.amount_free)),0)::integer,
         count(*)::integer
    into v_marketplace_spent,v_marketplace_purchases
  from public.playlist_sale_payments p
  where p.buyer_id=uid
    and p.provider='FREE_CREDITS'
    and p.status='COMPLETED'
    and coalesce(p.delivered_at,p.created_at)>=v_start
    and coalesce(p.delivered_at,p.created_at)<v_end;

  v_total_spent:=v_keep_spent+v_marketplace_spent;

  return jsonb_build_object(
    'spent',v_total_spent,
    'keepSpent',v_keep_spent,
    'keeps',v_keep_count,
    'marketplaceSpent',v_marketplace_spent,
    'marketplacePurchases',v_marketplace_purchases,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'startedAt',v_start,
    'endsAt',v_end
  );
end;
$function$;

revoke all on function public.keep_free_spent_today(text) from public,anon;
grant execute on function public.keep_free_spent_today(text) to authenticated,service_role;
