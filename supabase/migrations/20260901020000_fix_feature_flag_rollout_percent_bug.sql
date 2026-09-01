-- BUG RÉEL trouvé le 01/09/2026 (Adel, en direct : "Découvrir... Les
-- découvertes sont temporairement indisponibles" juste après le branchement
-- de local_discovery/events/compare_keep) : featureFlagService.isFeatureEnabled()
-- vérifie is_enabled_globally ET rollout_percent > 0, mais admin_feature_flag_set
-- ne touchait jamais rollout_percent -- resté à 0 sur toute la table depuis le
-- seed initial. Résultat : TROIS fonctionnalités réelles (dont l'onglet
-- Découvertes entier) se sont retrouvées coupées en production dès qu'un
-- coupe-circuit a enfin lu ce champ, alors que Super Admin affichait
-- "Activé". Corrigé en urgence en base (UPDATE direct), corrigé ici pour de
-- bon : activer un flag pousse maintenant rollout_percent à 100.

create or replace function public.admin_feature_flag_set(p_key text, p_enabled boolean)
returns table(key text, description text, is_enabled_globally boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  before_row jsonb;
begin
  if uid is null or not public.admin_has_role(uid, array['SUPER_ADMIN','ADMIN','TECH']) then
    raise exception 'admin_required';
  end if;

  select to_jsonb(f) into before_row
  from public.feature_flags f
  where f.key = p_key;

  if before_row is null then
    raise exception 'unknown_feature_flag';
  end if;

  update public.feature_flags f
  set is_enabled_globally = p_enabled,
      rollout_percent = case when p_enabled then 100 else f.rollout_percent end,
      updated_at = now(),
      updated_by = uid
  where f.key = p_key;

  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  select uid,
         'feature_flag.set',
         'feature_flag',
         p_key,
         before_row,
         to_jsonb(f)
  from public.feature_flags f
  where f.key = p_key;

  return query
  select f.key, f.description, f.is_enabled_globally, f.updated_at
  from public.feature_flags f
  where f.key = p_key;
end;
$$;

-- Rattrape toute autre ligne déjà marquée "Activé" mais restée à 0% par le
-- même bug historique.
update public.feature_flags set rollout_percent = 100 where is_enabled_globally = true and rollout_percent = 0;
