create or replace function public.keep_notify_admin_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_code text;
  plan_label text;
  duration_label text;
  monthly_free integer := 0;
  daily_solos integer := 0;
  vibe_trials integer := 0;
  benefits jsonb := '[]'::jsonb;
begin
  if new.source <> 'admin_grant' or new.status::text not in ('ACTIVE','TRIALING') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.source is not distinct from new.source
     and old.status is not distinct from new.status
     and old.plan_id is not distinct from new.plan_id
     and old.current_period_end is not distinct from new.current_period_end then
    return new;
  end if;

  select p.code::text, coalesce(p.name, p.code::text)
    into plan_code, plan_label
  from public.plans p
  where p.id = new.plan_id;

  plan_code := coalesce(plan_code, 'PREMIUM');
  plan_label := coalesce(plan_label, initcap(replace(plan_code, '_', ' ')));

  select coalesce(
    (select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key = 'free_monthly_bonus_' || lower(plan_code) limit 1),
    (select max(pp.free_bonus_per_month) from public.plan_prices pp where pp.plan_id = new.plan_id and pp.is_active = true),
    0
  ) into monthly_free;

  select coalesce(
    (select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key = 'battle_solo_daily_limit_' || lower(plan_code) limit 1),
    (select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key = 'battle_solo_daily_limit' limit 1),
    0
  ) into daily_solos;

  select coalesce(
    (select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key = 'premium_sort_trial_runs' limit 1),
    0
  ) into vibe_trials;

  duration_label := case
    when new.current_period_end is null then 'sans limite de durée'
    else 'jusqu’au ' || to_char(new.current_period_end at time zone 'Europe/Paris', 'DD/MM/YYYY')
  end;

  benefits := jsonb_build_array(
    case when monthly_free > 0 then monthly_free || ' Free offerts chaque mois' else 'Accès aux avantages du plan' end,
    case when daily_solos > 0 then daily_solos || ' Solos par jour' else 'Battle inclus' end,
    'Battle sans débit de Free avec un plan payant'
  );

  if plan_code = 'PREMIUM' then
    benefits := benefits || jsonb_build_array(
      'Découvertes de profils en illimité',
      case when vibe_trials > 0 then vibe_trials || ' essais Loki Music Vibes' else 'Loki Music Vibes inclus' end
    );
  elsif plan_code = 'CREATOR_PRO' then
    benefits := benefits || jsonb_build_array('Outils créateur avancés', 'Loki Music Vibes illimité');
  elsif plan_code = 'VENUE_PRO' then
    benefits := benefits || jsonb_build_array('Outils lieu et événements avancés', 'Audience Pro selon éligibilité');
  end if;

  insert into public.notifications(profile_id,type,title,body,data)
  values (
    new.profile_id,
    'PLAN_GIFTED',
    'Félicitations · ' || plan_label || ' offert',
    'Ton offre ' || plan_label || ' est activée ' || duration_label || '. '
      || case when monthly_free > 0 then monthly_free || ' Free/mois · ' else '' end
      || case when daily_solos > 0 then daily_solos || ' Solos/jour · ' else '' end
      || 'Battle inclus.',
    jsonb_build_object(
      'subscription_id', new.id,
      'plan_id', new.plan_id,
      'plan_code', plan_code,
      'plan_label', plan_label,
      'ends_at', new.current_period_end,
      'source', 'admin_grant',
      'celebration', true,
      'animation', 'PLAN_GIFTED',
      'monthly_free', monthly_free,
      'daily_solos', daily_solos,
      'vibe_trials', vibe_trials,
      'paid_battle_access', true,
      'benefits', benefits
    )
  );
  return new;
end;
$$;

revoke all on function public.keep_notify_admin_grant() from public, anon, authenticated;

drop trigger if exists trg_keep_notify_admin_grant on public.subscriptions;
create trigger trg_keep_notify_admin_grant
after insert or update on public.subscriptions
for each row execute function public.keep_notify_admin_grant();

update public.notifications n
set
  title = 'Félicitations · ' || coalesce(p.name, initcap(replace(p.code::text, '_', ' '))) || ' offert',
  body = 'Ton offre ' || coalesce(p.name, initcap(replace(p.code::text, '_', ' '))) || ' est activée '
    || case when s.current_period_end is null then 'sans limite de durée'
            else 'jusqu’au ' || to_char(s.current_period_end at time zone 'Europe/Paris', 'DD/MM/YYYY') end
    || '. '
    || coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='free_monthly_bonus_' || lower(p.code::text) limit 1),0)
    || ' Free/mois · '
    || coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='battle_solo_daily_limit_' || lower(p.code::text) limit 1),
                (select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='battle_solo_daily_limit' limit 1),0)
    || ' Solos/jour · Battle inclus.',
  data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object(
    'plan_code', p.code::text,
    'plan_label', coalesce(p.name, initcap(replace(p.code::text, '_', ' '))),
    'celebration', true,
    'animation', 'PLAN_GIFTED',
    'monthly_free', coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='free_monthly_bonus_' || lower(p.code::text) limit 1),0),
    'daily_solos', coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='battle_solo_daily_limit_' || lower(p.code::text) limit 1),
                            (select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='battle_solo_daily_limit' limit 1),0),
    'paid_battle_access', true
  )
from public.subscriptions s
join public.plans p on p.id = s.plan_id
where n.type = 'PLAN_GIFTED'
  and n.data->>'subscription_id' = s.id::text;
