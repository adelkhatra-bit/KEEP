-- Loki Music — notification automatique après le crédit mensuel de Free.
-- Le versement reste idempotent via monthly_free_credit_awards(profile_id,credit_month).
-- La notification est elle aussi idempotente par profil + mois crédité.
create or replace function public.keep_award_monthly_free_credits(p_as_of timestamptz default now())
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  inserted integer;
  first_month date;
  closed_month date;
begin
  first_month := (
    select (value #>> '{}')::date
    from public.remote_config
    where key = 'free_monthly_calendar_start'
  );
  closed_month := (date_trunc('month', p_as_of at time zone 'UTC') - interval '1 month')::date;
  if first_month is null or closed_month < first_month then return 0; end if;

  insert into public.monthly_free_credit_awards(profile_id,credit_month,amount,plan_code,reason)
  select
    p.id,
    m.month::date,
    greatest(0,coalesce(paid.free_bonus_per_month,free_price.free_bonus_per_month,0)),
    coalesce(paid.code,'FREE'),
    'MONTH_END'
  from public.profiles p
  join auth.users u on u.id = p.id
  cross join lateral generate_series(
    greatest(first_month,date_trunc('month',p.created_at at time zone 'UTC')::date)::timestamp,
    closed_month::timestamp,
    interval '1 month'
  ) m(month)
  left join lateral (
    select pl.code::text code,pp.free_bonus_per_month
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    join public.plan_prices pp on pp.id = s.plan_price_id
    where s.profile_id = p.id
      and s.status::text in ('ACTIVE','TRIALING','CANCELED','EXPIRED')
      and coalesce(s.current_period_start,s.created_at) < ((m.month + interval '1 month') at time zone 'UTC')
      and (s.current_period_end is null or s.current_period_end >= ((m.month + interval '1 month') at time zone 'UTC'))
    order by s.current_period_start desc nulls last,s.created_at desc
    limit 1
  ) paid on true
  left join lateral (
    select pp.free_bonus_per_month
    from public.plans pl
    join public.plan_prices pp on pp.plan_id = pl.id
    where pl.code = 'FREE'
      and pp.period = 'MONTHLY'
      and pp.is_active
    order by pp.effective_from desc nulls last
    limit 1
  ) free_price on true
  where not coalesce(u.is_anonymous,false)
  on conflict(profile_id,credit_month) do nothing;

  get diagnostics inserted = row_count;

  insert into public.notifications(profile_id,type,title,body,data)
  select
    award.profile_id,
    'MONTHLY_FREE_CREDIT',
    '🎁 Tes Free du mois sont arrivés',
    format(
      'Bonne nouvelle : la plateforme Loki Music vient de créditer +%s Free sur ton compte %s. Merci de faire vivre la communauté. Découvre, joue, garde — et garde ce qui te ressemble.',
      award.amount,
      case award.plan_code
        when 'CREATOR_PRO' then 'Creator Pro'
        when 'VENUE_PRO' then 'Venue Pro'
        when 'PREMIUM' then 'Premium'
        else 'Free'
      end
    ),
    jsonb_build_object(
      'type','MONTHLY_FREE_CREDIT',
      'creditMonth',award.credit_month::text,
      'amount',award.amount,
      'planCode',award.plan_code,
      'source','MONTHLY_FREE_AWARD'
    )
  from public.monthly_free_credit_awards award
  where award.credit_month = closed_month
    and award.reason = 'MONTH_END'
    and award.amount > 0
    and not exists (
      select 1
      from public.notifications n
      where n.profile_id = award.profile_id
        and n.type = 'MONTHLY_FREE_CREDIT'
        and n.data ->> 'creditMonth' = award.credit_month::text
    );

  return inserted;
end;
$function$;

comment on function public.keep_award_monthly_free_credits(timestamptz) is
'Crédite les Free du mois clos et crée une notification Loki Music idempotente par profil/mois.';
