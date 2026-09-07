-- Adel 07/09/2026 : "quand un utilisateur va repartager la musique, elle sera
-- toujours tamponnee avec le code couleur de la certification ... hormis si
-- demain il arrete son abonnement et repasse en Free, le systeme le detecte
-- et remet en vert" -- la couleur doit toujours etre calculee EN DIRECT depuis
-- la formule actuelle, jamais figee au moment du partage. RPC en lot (memes
-- calculs que keep_public_profile_snapshot) pour colorer l'attribution
-- ("Decouvert par X") de plusieurs morceaux sans une requete par ligne.

CREATE OR REPLACE FUNCTION public.keep_public_certification_tiers(p_profile_ids uuid[])
 RETURNS TABLE(profile_id uuid, certification_tier text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  return query
  select
    p.id,
    case
      when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
      when plan.code = 'VENUE_PRO' then 'VENUE_PRO'
      when plan.code = 'CREATOR_PRO' then 'CREATOR_PRO'
      when plan.code = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select pl.code::text as code
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p.id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ) plan on true
  where p.id = any(p_profile_ids) and p.is_public = true;
end;
$function$;

revoke all on function public.keep_public_certification_tiers(uuid[]) from public;
grant execute on function public.keep_public_certification_tiers(uuid[]) to anon, authenticated;
