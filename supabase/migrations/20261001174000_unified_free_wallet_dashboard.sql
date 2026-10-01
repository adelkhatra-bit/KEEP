-- Unified FREE counters for every user-facing interface.
-- One source of truth: balance + earned/lost/spent today, using the product day 02:00 -> 01:59.

create or replace function public.keep_free_wallet_status(p_timezone text default 'Europe/Paris')
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
  v_balance integer := 0;
  v_battle_earned integer := 0;
  v_solo_earned integer := 0;
  v_bonus_earned integer := 0;
  v_admin_earned integer := 0;
  v_marketplace_earned integer := 0;
  v_lost integer := 0;
  v_keep_spent integer := 0;
  v_keep_count integer := 0;
  v_marketplace_spent integer := 0;
  v_marketplace_purchase_count integer := 0;
  v_earned integer := 0;
  v_spent integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_local_start := date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start := v_local_start at time zone v_tz;
  v_end := (v_local_start+interval '1 day') at time zone v_tz;

  v_balance := public.keep_theoretical_free_credit_remaining_for_profile(uid);

  select coalesce(sum(greatest(e.amount,0)),0)::integer,
         coalesce(sum(abs(least(e.amount,0))),0)::integer
    into v_battle_earned,v_lost
  from (
    select amount,created_at from public.keep_battle_credit_events where profile_id=uid
    union all
    select amount,created_at from public.keep_battle_arena_credit_events where profile_id=uid
  ) e
  where e.created_at>=v_start and e.created_at<v_end;

  select coalesce(sum(greatest(amount,0)),0)::integer
    into v_solo_earned
  from public.keep_battle_solo_credit_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select v_lost + coalesce(sum(abs(least(amount,0))),0)::integer
    into v_lost
  from public.keep_battle_solo_credit_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount,0)),0)::integer
    into v_bonus_earned
  from public.keep_battle_perfect_bonus_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount,0)),0)::integer
    into v_admin_earned
  from public.admin_credit_grants
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount_free,0)),0)::integer
    into v_marketplace_earned
  from public.playlist_sale_payments
  where seller_id=uid
    and provider='FREE_CREDITS'
    and status='COMPLETED'
    and coalesce(delivered_at,created_at)>=v_start
    and coalesce(delivered_at,created_at)<v_end;

  select coalesce(sum(greatest(amount,0)),0)::integer,count(*)::integer
    into v_keep_spent,v_keep_count
  from public.keep_free_spend_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount_free,0)),0)::integer,count(*)::integer
    into v_marketplace_spent,v_marketplace_purchase_count
  from public.playlist_sale_payments
  where buyer_id=uid
    and provider='FREE_CREDITS'
    and status='COMPLETED'
    and coalesce(delivered_at,created_at)>=v_start
    and coalesce(delivered_at,created_at)<v_end;

  v_earned := v_battle_earned+v_solo_earned+v_bonus_earned+v_admin_earned+v_marketplace_earned;
  v_spent := v_keep_spent+v_marketplace_spent;

  return jsonb_build_object(
    'balance',v_balance,
    'earnedToday',v_earned,
    'lostToday',v_lost,
    'spentToday',v_spent,
    'netToday',v_earned-v_lost-v_spent,
    'battleEarnedToday',v_battle_earned,
    'soloEarnedToday',v_solo_earned,
    'bonusEarnedToday',v_bonus_earned,
    'adminEarnedToday',v_admin_earned,
    'marketplaceEarnedToday',v_marketplace_earned,
    'keepSpentToday',v_keep_spent,
    'keepCountToday',v_keep_count,
    'marketplaceSpentToday',v_marketplace_spent,
    'marketplacePurchaseCountToday',v_marketplace_purchase_count,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'startedAt',v_start,
    'endsAt',v_end
  );
end;
$function$;

revoke all on function public.keep_free_wallet_status(text) from public,anon;
grant execute on function public.keep_free_wallet_status(text) to authenticated;

create or replace function public.keep_notify_free_credit_reward()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_profile_id uuid;
  v_amount integer;
  v_source text := upper(tg_table_name);
  v_source_id text;
  v_label text := 'Bonus Loki';
  v_balance integer := 0;
begin
  v_profile_id := new.profile_id;
  v_amount := coalesce(new.amount,0);
  v_source_id := new.id::text;

  if v_amount <= 0 then return new; end if;

  if tg_table_name='keep_battle_solo_credit_events' then v_label := 'Solo parfait';
  elsif tg_table_name='keep_battle_arena_credit_events' then v_label := 'Battle arène';
  elsif tg_table_name='keep_battle_credit_events' then v_label := 'Battle';
  elsif tg_table_name='keep_battle_perfect_bonus_events' then v_label := 'Bonus parfait';
  elsif tg_table_name='admin_credit_grants' then v_label := 'Bonus Loki';
  end if;

  if exists(
    select 1 from public.notifications n
    where n.profile_id=v_profile_id
      and n.type='FREE_CREDIT_REWARD'
      and n.data->>'sourceId'=v_source_id
      and n.data->>'sourceTable'=tg_table_name
  ) then
    return new;
  end if;

  v_balance := public.keep_theoretical_free_credit_remaining_for_profile(v_profile_id);

  insert into public.notifications(profile_id,type,title,body,data)
  values(
    v_profile_id,
    'FREE_CREDIT_REWARD',
    '✨ +'||v_amount||' FREE crédités !',
    v_label||' · ton nouveau solde est de '||v_balance||' FREE.',
    jsonb_build_object(
      'event','FREE_CREDIT_REWARD',
      'amount',v_amount,
      'balance',v_balance,
      'source',v_label,
      'sourceId',v_source_id,
      'sourceTable',tg_table_name,
      'soundKind','reward'
    )
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_free_duel_reward on public.keep_battle_credit_events;
create trigger trg_notify_free_duel_reward
after insert on public.keep_battle_credit_events
for each row execute function public.keep_notify_free_credit_reward();

drop trigger if exists trg_notify_free_arena_reward on public.keep_battle_arena_credit_events;
create trigger trg_notify_free_arena_reward
after insert on public.keep_battle_arena_credit_events
for each row execute function public.keep_notify_free_credit_reward();

drop trigger if exists trg_notify_free_solo_reward on public.keep_battle_solo_credit_events;
create trigger trg_notify_free_solo_reward
after insert on public.keep_battle_solo_credit_events
for each row execute function public.keep_notify_free_credit_reward();

drop trigger if exists trg_notify_free_perfect_reward on public.keep_battle_perfect_bonus_events;
create trigger trg_notify_free_perfect_reward
after insert on public.keep_battle_perfect_bonus_events
for each row execute function public.keep_notify_free_credit_reward();

drop trigger if exists trg_notify_free_admin_reward on public.admin_credit_grants;
create trigger trg_notify_free_admin_reward
after insert on public.admin_credit_grants
for each row execute function public.keep_notify_free_credit_reward();

revoke all on function public.keep_notify_free_credit_reward() from public,anon,authenticated;
