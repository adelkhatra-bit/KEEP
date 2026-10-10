-- Copie dans le dépôt de ce qui est DÉJÀ appliqué en production (07/10/2026).
-- Tableau de bord Super Admin en lecture seule : vrais ≠ tests, payants ≠ offerts, une ligne par devise (jamais additionnées).

CREATE OR REPLACE FUNCTION public.admin_dashboard_v2(p_from date DEFAULT (CURRENT_DATE - 29), p_to date DEFAULT CURRENT_DATE, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_country text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  v jsonb;
begin
  if not exists (select 1 from public.admin_users a where a.id = auth.uid() and a.is_active = true) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 3660 then
    raise exception 'invalid_date_range';
  end if;
  v_from := p_from::timestamptz;
  v_to := (p_to + 1)::timestamptz;

  with pr as (
    select p.id, p.created_at, p.country_code::text cc, public.keep_is_test_profile(p.id) is_test,
           exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null) verified
      from public.profiles p
     where v_country is null or p.country_code::text = v_country
  ),
  active_p as (
    select distinct k.profile_id from public.keep_decisions k where k.created_at >= v_from and k.created_at < v_to
    union
    select distinct e.profile_id from public.product_events e where e.created_at >= v_from and e.created_at < v_to and e.profile_id is not null
  ),
  subs as (
    select s.profile_id, (coalesce(s.source, '') = 'admin_grant') offered
      from public.subscriptions s join public.plans pl on pl.id = s.plan_id
     where s.status in ('ACTIVE'::public.subscription_status, 'TRIALING'::public.subscription_status)
       and pl.code::text <> 'FREE'
       and (s.current_period_end is null or s.current_period_end > now())
  ),
  ev as (
    select e.*, pr.is_test from public.product_events e left join pr on pr.id = e.profile_id
     where e.created_at >= v_from and e.created_at < v_to
       and (v_country is null or e.country_code::text = v_country or pr.id is not null)
  )
  select jsonb_build_object(
    'people', jsonb_build_object(
      'real', jsonb_build_object(
        'total', (select count(*) from pr where not is_test),
        'new', (select count(*) from pr where not is_test and created_at >= v_from and created_at < v_to),
        'verified', (select count(*) from pr where not is_test and verified),
        'active', (select count(*) from pr join active_p a on a.profile_id = pr.id where not pr.is_test)),
      'test', jsonb_build_object(
        'total', (select count(*) from pr where is_test),
        'new', (select count(*) from pr where is_test and created_at >= v_from and created_at < v_to),
        'verified', (select count(*) from pr where is_test and verified),
        'active', (select count(*) from pr join active_p a on a.profile_id = pr.id where pr.is_test))),
    'money', jsonb_build_object(
      'byCurrency', coalesce((select jsonb_agg(jsonb_build_object('currency', cur, 'gross', gross, 'refunds', refunds, 'net', gross - refunds, 'count', cnt) order by cur)
        from (select t.currency_code::text cur, sum(t.amount) gross, count(*) cnt,
                     coalesce(sum((select sum(r.amount) from public.refunds r where r.transaction_id = t.id)), 0) refunds
                from public.transactions t join pr on pr.id = t.profile_id and not pr.is_test
               where t.status in ('SUCCEEDED'::public.transaction_status, 'REFUNDED'::public.transaction_status, 'PARTIALLY_REFUNDED'::public.transaction_status)
                 and t.created_at >= v_from and t.created_at < v_to
               group by t.currency_code) m), '[]'::jsonb),
      'paidSubscribers', (select count(distinct s.profile_id) from subs s join pr on pr.id = s.profile_id and not pr.is_test where not s.offered),
      'freePacksBought', jsonb_build_object(
        'count', (select count(*) from public.keep_iap_consumable_transactions c join pr on pr.id = c.profile_id and not pr.is_test where c.created_at >= v_from and c.created_at < v_to),
        'free', (select coalesce(sum(c.free_amount), 0) from public.keep_iap_consumable_transactions c join pr on pr.id = c.profile_id and not pr.is_test where c.created_at >= v_from and c.created_at < v_to)),
      'marketByCurrency', coalesce((select jsonb_agg(jsonb_build_object('currency', cur, 'cents', cents, 'count', cnt) order by cur)
        from (select sp.currency_code::text cur, sum(sp.amount_cents) cents, count(*) cnt
                from public.playlist_sale_payments sp join pr on pr.id = sp.buyer_id and not pr.is_test
               where sp.status = 'COMPLETED' and coalesce(sp.amount_cents, 0) > 0
                 and sp.created_at >= v_from and sp.created_at < v_to
               group by sp.currency_code) m), '[]'::jsonb)),
    'offered', jsonb_build_object(
      'subscriptions', (select count(distinct s.profile_id) from subs s join pr on pr.id = s.profile_id where s.offered),
      'subscriptionsReal', (select count(distinct s.profile_id) from subs s join pr on pr.id = s.profile_id and not pr.is_test where s.offered),
      'adminFree', jsonb_build_object(
        'real', (select coalesce(sum(g.amount), 0) from public.admin_credit_grants g join pr on pr.id = g.profile_id and not pr.is_test where g.created_at >= v_from and g.created_at < v_to),
        'test', (select coalesce(sum(g.amount), 0) from public.admin_credit_grants g join pr on pr.id = g.profile_id and pr.is_test where g.created_at >= v_from and g.created_at < v_to)),
      'monthlyFree', jsonb_build_object(
        'real', (select coalesce(sum(m.amount), 0) from public.monthly_free_credit_awards m join pr on pr.id = m.profile_id and not pr.is_test where m.created_at >= v_from and m.created_at < v_to),
        'test', (select coalesce(sum(m.amount), 0) from public.monthly_free_credit_awards m join pr on pr.id = m.profile_id and pr.is_test where m.created_at >= v_from and m.created_at < v_to))),
    'freeEconomy', jsonb_build_object(
      'earnedByType', coalesce((select jsonb_object_agg(t, n) from (
          select f.event_type t, sum(f.amount) n from public.keep_free_economy_events f join pr on pr.id = f.profile_id and not pr.is_test
           where f.created_at >= v_from and f.created_at < v_to group by f.event_type
          union all
          select 'BATTLE_SOLO', sum(b.amount) from public.keep_battle_solo_credit_events b join pr on pr.id = b.profile_id and not pr.is_test
           where b.amount > 0 and b.created_at >= v_from and b.created_at < v_to having count(*) > 0
          union all
          select 'BATTLE_ONLINE', sum(b.amount) from public.keep_battle_credit_events b join pr on pr.id = b.profile_id and not pr.is_test
           where b.amount > 0 and b.created_at >= v_from and b.created_at < v_to having count(*) > 0) x), '{}'::jsonb),
      'soloPacksFree', (select coalesce(sum(sp.free_spent), 0) from public.keep_battle_solo_pack_purchases sp join pr on pr.id = sp.profile_id and not pr.is_test where sp.created_at >= v_from and sp.created_at < v_to),
      'marketFree', (select coalesce(sum(ft.amount_free), 0) from public.playlist_sale_free_transfers ft join pr on pr.id = ft.buyer_id and not pr.is_test where ft.created_at >= v_from and ft.created_at < v_to)),
    'shares', jsonb_build_object(
      'real', (select count(*) from ev where profile_id is not null and not coalesce(is_test, false)),
      'test', (select count(*) from ev where coalesce(is_test, false)),
      'anonymous', (select count(*) from ev where profile_id is null),
      'byChannel', coalesce((select jsonb_agg(jsonb_build_object('channel', ch, 'count', n) order by n desc)
        from (select coalesce(channel, 'other') ch, count(*) n from ev where not coalesce(is_test, false) group by 1) c), '[]'::jsonb),
      'sharers', (select count(distinct profile_id) from ev where profile_id is not null and not coalesce(is_test, false))),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'date', d::date,
        'signupsReal', (select count(*) from pr where not is_test and created_at >= d and created_at < d + interval '1 day'),
        'signupsTest', (select count(*) from pr where is_test and created_at >= d and created_at < d + interval '1 day'),
        'sharesReal', (select count(*) from ev where not coalesce(is_test, false) and created_at >= d and created_at < d + interval '1 day'),
        'revenueCents', 0) order by d)
      from generate_series(p_from, p_to, interval '1 day') d), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$;
revoke all on function public.admin_dashboard_v2(date, date, text) from public, anon;
grant execute on function public.admin_dashboard_v2(date, date, text) to authenticated, service_role;
