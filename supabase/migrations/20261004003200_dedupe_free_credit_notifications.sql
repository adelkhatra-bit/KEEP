-- Un gain de Free ne doit produire qu'une seule confirmation.
-- FREE_CREDITED reste la notification canonique pour les crédits Battle/Solo.
drop trigger if exists trg_notify_free_solo_reward on public.keep_battle_solo_credit_events;
drop trigger if exists trg_notify_free_arena_reward on public.keep_battle_arena_credit_events;
drop trigger if exists trg_notify_free_duel_reward on public.keep_battle_credit_events;

-- Nettoyer seulement les doublons encore non lus. L'historique déjà consulté
-- n'est pas réécrit.
delete from public.notifications reward
where reward.type='FREE_CREDIT_REWARD'
  and reward.read_at is null
  and reward.data->>'sourceTable' in (
    'keep_battle_solo_credit_events',
    'keep_battle_arena_credit_events',
    'keep_battle_credit_events'
  )
  and exists (
    select 1
    from public.notifications credited
    where credited.profile_id=reward.profile_id
      and credited.type='FREE_CREDITED'
      and credited.data->>'creditEventId'=reward.data->>'sourceId'
  );
