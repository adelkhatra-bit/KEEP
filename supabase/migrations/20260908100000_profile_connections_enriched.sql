-- Adel (08/09/2026) : "comment ca se fait qu'on a pas les pastilles des
-- abonnes et le style musical ... si il est certifie" -- la liste
-- Abonnes/Abonnements (CommunityConnectionsPanel) ne renvoyait qu'un id de
-- profil brut, pas de certification ni de style musical, contrairement a
-- "Qui a repris tes morceaux" (keep_profile_reprisers) qui les affiche deja.
-- Meme logique de certification reprise ici, appliquee aux deux sens
-- (followers et following) en un seul RPC parametre par p_mode.
create or replace function public.keep_profile_connections(p_profile_id uuid, p_mode text)
returns table(
  profile_id uuid,
  username text,
  avatar_url text,
  kind text,
  certification_tier text,
  favorite_genres text[],
  is_following boolean
)
language plpgsql
stable security definer
set search_path = 'public', 'auth'
as $function$
declare v_uid uuid := auth.uid();
begin
  if p_mode = 'followers' then
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
      (v_uid is not null and exists(select 1 from public.follows f2 where f2.follower_id = v_uid and f2.followee_id = p.id))
    from public.follows f
    join public.profiles p on p.id = f.follower_id
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
    where f.followee_id = p_profile_id and p.is_public = true
    order by p.username asc
    limit 200;
  else
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
      true
    from public.follows f
    join public.profiles p on p.id = f.followee_id
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
    where f.follower_id = p_profile_id and p.is_public = true
    order by p.username asc
    limit 200;
  end if;
end;
$function$;
