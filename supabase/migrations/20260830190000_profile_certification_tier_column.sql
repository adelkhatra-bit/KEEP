-- KEEP — colonne réelle profiles.certification_tier.
--
-- BUG RÉEL trouvé le 30/08/2026 (audit Découvertes en direct sur
-- https://adelkhatra-bit.github.io/KEEP) : DiscoverScreen.tsx sélectionne
-- `certification_tier` comme une colonne normale de `profiles`, mais cette
-- valeur n'a jamais existé qu'en tant que résultat calculé par les fonctions
-- keep_public_profile_snapshot()/admin_user_directory() -- jamais stockée.
-- Conséquence : TOUTE requête Découvertes échouait avec l'erreur Postgres
-- 42703 "column profiles.certification_tier does not exist", donc l'écran
-- ne montrait jamais aucun profil à découvrir, pour personne.
--
-- Colonne réelle ajoutée + rétro-remplie avec la même logique que les
-- fonctions existantes, puis maintenue par trigger sur `subscriptions`
-- (le cas qui change le plus souvent en pratique : abonnement pris/annulé).
-- Le passage anonyme -> vérifié via auth.users est plus rare et n'a pas de
-- trigger dédié ici -- un profil concerné se corrige au prochain changement
-- d'abonnement, ou peut être recalculé manuellement via
-- keep_recompute_certification_tier(profile_id).

alter table public.profiles
  add column if not exists certification_tier text not null default 'UNVERIFIED';

create or replace function public.keep_recompute_certification_tier(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_verified boolean := false;
  v_plan text := 'FREE';
  v_tier text;
begin
  select coalesce(not u.is_anonymous, false) into v_verified
  from auth.users u where u.id = p_profile_id;
  v_verified := coalesce(v_verified, false);

  select coalesce((
    select pl.code::text
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p_profile_id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ), 'FREE') into v_plan;

  v_tier := case
    when not v_verified then 'UNVERIFIED'
    when v_plan = 'VENUE_PRO' then 'VENUE_PRO'
    when v_plan = 'CREATOR_PRO' then 'CREATOR_PRO'
    when v_plan = 'PREMIUM' then 'PREMIUM'
    else 'FREE'
  end;

  update public.profiles set certification_tier = v_tier, updated_at = now()
  where id = p_profile_id and certification_tier is distinct from v_tier;
end;
$$;

revoke all on function public.keep_recompute_certification_tier(uuid) from public;
grant execute on function public.keep_recompute_certification_tier(uuid) to service_role, authenticated;

-- Rétro-remplissage réel de tous les profils existants.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.profiles loop
    perform public.keep_recompute_certification_tier(v_id);
  end loop;
end;
$$;

create or replace function public.keep_certification_tier_on_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.keep_recompute_certification_tier(old.profile_id);
    return old;
  end if;
  perform public.keep_recompute_certification_tier(new.profile_id);
  return new;
end;
$$;

drop trigger if exists keep_certification_tier_on_subscription_change on public.subscriptions;
create trigger keep_certification_tier_on_subscription_change
  after insert or update or delete on public.subscriptions
  for each row execute function public.keep_certification_tier_on_subscription_change();
