-- Realtime confirmation for every real positive FREE credit.
-- The notification is created only AFTER the ledger row exists, so the UI
-- never celebrates an estimated/local-only reward.

create or replace function public.keep_notify_positive_free_credit()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_source text;
  v_source_id text;
  v_label text;
begin
  if coalesce(new.amount,0) <= 0 then
    return new;
  end if;

  if tg_table_name='keep_battle_solo_credit_events' then
    v_source := 'SOLO';
    v_source_id := new.history_id::text;
    v_label := 'Solo';
  elsif tg_table_name='keep_battle_arena_credit_events' then
    v_source := 'ARENA';
    v_source_id := new.arena_id::text || ':' || new.match_no::text;
    v_label := 'Battle';
  elsif tg_table_name='keep_battle_credit_events' then
    v_source := 'DUEL';
    v_source_id := new.battle_id::text;
    v_label := 'Battle';
  else
    return new;
  end if;

  insert into public.notifications(
    profile_id,type,title,body,data,push_delivery_status,push_attempt_count
  )
  values(
    new.profile_id,
    'FREE_CREDITED',
    '🎆 +' || new.amount || ' FREE crédités !',
    v_label || ' validé · ton solde et tes compteurs viennent d’être mis à jour.',
    jsonb_build_object(
      'event','FREE_CREDITED',
      'amount',new.amount,
      'source',v_source,
      'sourceId',v_source_id,
      'creditEventId',new.id,
      'result',new.result,
      'celebration','fireworks',
      'soundKind','money'
    ),
    'CREATED',
    0
  );

  return new;
end;
$function$;

revoke all on function public.keep_notify_positive_free_credit() from public,anon,authenticated;

drop trigger if exists trg_keep_battle_credit_notify on public.keep_battle_credit_events;
create trigger trg_keep_battle_credit_notify
after insert on public.keep_battle_credit_events
for each row execute function public.keep_notify_positive_free_credit();

drop trigger if exists trg_keep_battle_arena_credit_notify on public.keep_battle_arena_credit_events;
create trigger trg_keep_battle_arena_credit_notify
after insert on public.keep_battle_arena_credit_events
for each row execute function public.keep_notify_positive_free_credit();

drop trigger if exists trg_keep_battle_solo_credit_notify on public.keep_battle_solo_credit_events;
create trigger trg_keep_battle_solo_credit_notify
after insert on public.keep_battle_solo_credit_events
for each row execute function public.keep_notify_positive_free_credit();
