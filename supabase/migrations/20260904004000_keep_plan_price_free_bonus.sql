-- Adel (04/09/2026) : "regarde bien où y a prix mensuel et prix annuel ...
-- le nombre de Free que je vais donner avec, et ça ira modifier
-- automatiquement dans les offres." Le bonus Free mensuel vivait dans 4
-- clés remote_config plates (une par PLAN), sans distinction mensuel/annuel.
-- Deplace vers une colonne sur plan_prices : chaque ligne de prix (mensuel
-- ET annuel, pour chaque formule) porte desormais son propre taux Free/mois
-- -- reglable au meme endroit que le prix lui-meme, dans Abonnements, Prix &
-- Quotas. Le rythme d'acquisition reste inchange (un mois PLEIN ecoule
-- depuis la creation du profil = +N Free, cumulatif, jamais remis a zero) :
-- seul N devient precis par prix/periode au lieu d'etre fixe par plan.
alter table public.plan_prices add column if not exists free_bonus_per_month integer not null default 0;

update public.plan_prices pp set free_bonus_per_month = case p.code
  when 'PREMIUM' then 15
  when 'CREATOR_PRO' then 40
  when 'VENUE_PRO' then 100
  else 5
end
from public.plans p
where p.id = pp.plan_id and pp.free_bonus_per_month = 0;

create or replace function public.keep_monthly_free_bonus_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_rate integer;
  v_created_at timestamptz;
  v_months integer := 0;
begin
  if p_uid is null then return 0; end if;

  select pp.free_bonus_per_month into v_rate
  from public.subscriptions s
  join public.plan_prices pp on pp.id = s.plan_price_id
  where s.profile_id = p_uid
    and s.status in ('ACTIVE','TRIALING')
    and (s.current_period_end is null or s.current_period_end > now())
  order by s.current_period_start desc nulls last, s.created_at desc
  limit 1;

  if v_rate is null then
    select pp.free_bonus_per_month into v_rate
    from public.plans p
    join public.plan_prices pp on pp.plan_id = p.id
    where p.code = 'FREE' and pp.period = 'MONTHLY' and pp.is_active
    order by pp.effective_from desc nulls last
    limit 1;
  end if;
  v_rate := coalesce(v_rate, 0);

  select created_at into v_created_at from public.profiles where id = p_uid;
  if v_created_at is null then return 0; end if;
  v_months := greatest(0, floor(extract(epoch from (now() - v_created_at)) / (30 * 86400))::integer);
  return v_rate * v_months;
end;
$function$;
