-- Production parity for migration 20261003225133.
-- A Battle victory/loss already has its canonical Battle notification.
-- Keep the credit ledger row, but do not create a second generic FREE_CREDITED
-- notification for the exact same arena/duel result. Solo remains distinct.

create or replace function public.keep_notify_positive_free_credit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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
    return new;
  elsif tg_table_name='keep_battle_credit_events' then
    return new;
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
