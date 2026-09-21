-- Adel (21/09/2026) : "J'ai donné 1000 abonnés à adel4A via le Super
-- Admin, et les fonctions ont disparu au lieu de se débloquer."
--
-- Root cause identifiée (pas un bug de la surcharge d'abonnés -- elle est
-- correctement enregistrée et correctement lue) : profiles.follower_count_override
-- = 1000 pour adel4A est bien en base, et keep_playlist_sale_access() la lit
-- déjà correctement (vérifié en direct sur la fonction live en production).
-- Le vrai responsable est le flag global playlist_marketplace, remis à
-- is_enabled_globally=false plus tôt dans cette même session sur demande
-- explicite d'Adel (risque Apple IAP, voir docs/PLATFORM_COMPLIANCE.md §9.3)
-- : ce flag gate TOUT le bouton VENDRE et la sélection multiple
-- (MyMusicScreen.tsx, isFeatureEnabled('playlist_marketplace')), pour TOUT
-- LE MONDE, quel que soit le nombre d'abonnés réel ou virtuel -- les deux
-- mécanismes n'ont jamais été reliés. Couper le flag global cache donc la
-- fonction pour un compte de test même avec 1000 abonnés virtuels : c'est
-- exactement l'effet "disparu au lieu de débloqué" observé.
--
-- Correctif : un bypass PAR COMPTE, séparé du flag global -- pour ne
-- jamais avoir à rallumer le flag pour tout le monde (et reprendre le
-- risque Apple IAP) juste pour qu'un compte de test puisse continuer à
-- tester.
create table if not exists public.feature_flag_test_accounts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  flag_key text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_users(id),
  primary key (profile_id, flag_key)
);
alter table public.feature_flag_test_accounts enable row level security;
drop policy if exists "feature_flag_test_accounts_read_own" on public.feature_flag_test_accounts;
create policy "feature_flag_test_accounts_read_own" on public.feature_flag_test_accounts for select using (auth.uid() = profile_id);

-- Vue côté app : vrai OU (flag global actif) OU (bypass explicite pour ce
-- compte). Remplace l'usage client de isFeatureEnabled() pour les flags
-- qui ont besoin de ce bypass -- fonctionne aussi bien pour un visiteur
-- anonyme (uid null -> seul le flag global compte).
create or replace function public.keep_feature_flag_enabled_for_me(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_global boolean := false;
  v_rollout integer := 0;
  v_bypass boolean := false;
begin
  select is_enabled_globally, rollout_percent into v_global, v_rollout
  from public.feature_flags where key = p_key;

  if v_global is true and coalesce(v_rollout, 0) > 0 then return true; end if;

  if uid is not null then
    select exists(
      select 1 from public.feature_flag_test_accounts
      where profile_id = uid and flag_key = p_key
    ) into v_bypass;
  end if;

  return coalesce(v_bypass, false);
end;
$function$;
grant execute on function public.keep_feature_flag_enabled_for_me(text) to authenticated, anon;

create or replace function public.admin_set_feature_flag_test_bypass(p_profile_id uuid, p_flag_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id = v_uid and a.is_active = true) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_enabled then
    insert into public.feature_flag_test_accounts(profile_id, flag_key, created_by)
    values (p_profile_id, p_flag_key, v_uid)
    on conflict (profile_id, flag_key) do nothing;
  else
    delete from public.feature_flag_test_accounts where profile_id = p_profile_id and flag_key = p_flag_key;
  end if;
  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, after)
  values (v_uid, 'user.feature_flag_test_bypass.set', 'profile', p_profile_id::text, jsonb_build_object('flagKey', p_flag_key, 'enabled', p_enabled));
end;
$$;
revoke all on function public.admin_set_feature_flag_test_bypass(uuid, text, boolean) from public;
grant execute on function public.admin_set_feature_flag_test_bypass(uuid, text, boolean) to authenticated;

-- Débloque immédiatement adel4A pour continuer à tester la marketplace
-- sans réactiver le flag global (donc sans reprendre le risque Apple IAP).
insert into public.feature_flag_test_accounts(profile_id, flag_key)
select id, 'playlist_marketplace' from public.profiles where lower(username) = lower('adel4A')
on conflict (profile_id, flag_key) do nothing;
