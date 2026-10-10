-- Classement des membres (Adel 05/10/2026) : « celui qui partage le plus, qui fait le plus reprendre sa musique, qui gagne le plus d'abonnés » ;
-- un petit badge sur la bulle donne envie de monter. Lecture seule : calcul sur 7 jours glissants, aucune donnée modifiée.
-- Score = 1 point par partage en story + 3 par reprise de sa musique par un autre membre + 2 par nouvel abonné. Top 50 des profils publics.
create or replace function public.keep_story_ranking()
returns table(profile_id uuid, score integer, rank integer)
language sql stable security definer set search_path to 'public' as $function$
  with events as (
    select sp.profile_id as pid, 1 as pts from public.story_pins sp where sp.masked = false and sp.pinned_at > now() - interval '7 days'
    union all
    select d.source_user_id, 3 from public.keep_decisions d where d.decision = 'KEPT' and d.source_user_id is not null and d.source_user_id <> d.profile_id and d.created_at > now() - interval '7 days'
    union all
    select f.followee_id, 2 from public.follows f where f.follower_id <> f.followee_id and f.created_at > now() - interval '7 days'
  ), scored as (
    select e.pid, sum(e.pts)::integer as score from events e
    join public.profiles p on p.id = e.pid and p.is_public = true and coalesce(p.discovery_hidden, false) = false
    group by e.pid
  )
  select s.pid, s.score, (row_number() over (order by s.score desc, s.pid))::integer as rank
  from scored s order by s.score desc, s.pid limit 50;
$function$;
revoke all on function public.keep_story_ranking() from public, anon;
grant execute on function public.keep_story_ranking() to authenticated;
