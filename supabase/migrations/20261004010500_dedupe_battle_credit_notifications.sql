-- 2026-10-04 — évite les doubles notifications de gain Battle.
-- BATTLE_ARENA_WIN / BATTLE_REWARD portent déjà le résultat et le montant.
-- Les crédits Solo/Admin continuent de produire leur notification dédiée.

create or replace function public.keep_notify_free_credit_reward()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_amount integer;
  v_source_id text;
  v_label text := 'Bonus Loki';
  v_balance integer := 0;
begin
  v_profile_id := new.profile_id;
  v_amount := coalesce(new.amount,0);
  v_source_id := new.id::text;

  if v_amount <= 0 then return new; end if;

  -- Le résultat Battle/arène génère déjà une notification métier complète
  -- (gagné/perdu + variation de Free). Ne jamais pousser une seconde ligne
  -- "FREE crédités" pour le même événement.
  if tg_table_name in ('keep_battle_arena_credit_events','keep_battle_credit_events') then
    return new;
  end if;

  if tg_table_name='keep_battle_solo_credit_events' then v_label := 'Solo parfait';
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

-- Historique conservé volontairement : aucun DELETE de notifications utilisateur.
