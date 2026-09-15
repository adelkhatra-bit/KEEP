-- Adel 07/09/2026 : sur "Reprises", il faut pouvoir voir QUI a repris les
-- morceaux du profil, s'abonner directement, et voir leur style musical --
-- "pour inciter les gens a s'abonner entre eux". Certification calculee en
-- direct (meme regle que le reste), is_following calcule pour le VIEWER
-- courant (auth.uid()), jamais pour le profil visite.

CREATE OR REPLACE FUNCTION public.keep_profile_reprisers(p_profile_id uuid)
 RETURNS TABLE(
   profile_id uuid,
   username text,
   avatar_url text,
   kind text,
   certification_tier text,
   favorite_genres text[],
   reprise_count integer,
   is_following boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_uid uuid := auth.uid();
begin
  return query
  select
    p.id,
    p.username,
    p.avatar_url,
    p.kind::text,
    case
      when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
      when plan.code = 'VENUE_PRO' then 'VENUE_PRO'
      when plan.code = 'CREATOR_PRO' then 'CREATOR_PRO'
      when plan.code = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text,
    coalesce(p.favorite_genres, array[]::text[]),
    count(kd.id)::integer,
    (v_uid is not null and exists(select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.id))
  from public.keep_decisions kd
  join public.profiles p on p.id = kd.profile_id
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
  where kd.source_user_id = p_profile_id
    and kd.decision = 'KEPT'
    and p.is_public = true
    and p.id <> p_profile_id
  group by p.id, p.username, p.avatar_url, p.kind, u.is_anonymous, plan.code, p.favorite_genres
  order by count(kd.id) desc, p.username asc
  limit 100;
end;
$function$;

revoke all on function public.keep_profile_reprisers(uuid) from public;
grant execute on function public.keep_profile_reprisers(uuid) to anon, authenticated;
