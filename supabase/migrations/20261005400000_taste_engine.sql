-- Moteur de goût et de recommandations (Adel 05/10/2026, IDEA-112, « machine de guerre ») : toutes les réactions et actions deviennent des signaux ;
-- le système propose automatiquement des musiques au style de chacun. LECTURE SEULE (aucune donnée modifiée).
-- Signaux (poids par genre) : GARDER +2 · ❤ aimé +3 · 😐 bof +0,5 · 👎 pas aimé −3 · partage en story +1.
create policy track_dislikes_delete_own on public.track_dislikes for delete to authenticated using (profile_id = auth.uid());

create or replace function public.keep_my_taste_profile()
returns table(genre text, weight numeric) language sql stable security definer set search_path to 'public' as $function$
  with signals as (
    select t.id::text as tid, 2.0 as w from public.keep_decisions k join public.tracks t on t.id = k.track_id where k.profile_id = auth.uid() and k.decision = 'KEPT'
    union all select l.track_id::text, 3.0 from public.track_likes l where l.profile_id = auth.uid()
    union all select d.track_id, case when d.reaction = 'MEH' then 0.5 else -3.0 end from public.track_dislikes d where d.profile_id = auth.uid()
    union all select sp.track_id::text, 1.0 from public.story_pins sp where sp.profile_id = auth.uid()
  )
  select lower(trim(g)) as genre, round(sum(s.w)::numeric, 2) as weight
  from signals s
  join public.tracks t on t.id::text = s.tid
  cross join lateral unnest(coalesce(t.genres, array[]::text[])) g
  where trim(g) <> ''
  group by 1
  having sum(s.w) <> 0
  order by 2 desc
  limit 40;
$function$;

create or replace function public.keep_recommend_for_me(p_limit integer default 20)
returns table(track_id uuid, title text, artist text, album text, artwork_url text, preview_url text, genres text[], score numeric, reason text, source_username text)
language sql stable security definer set search_path to 'public' as $function$
  with me as (select auth.uid() as uid),
  taste as (select genre, weight from public.keep_my_taste_profile()),
  excluded as (
    select k.track_id::text as tid from public.keep_decisions k, me where k.profile_id = me.uid and k.decision = 'KEPT'
    union select d.track_id from public.track_dislikes d, me where d.profile_id = me.uid
    union select l.track_id::text from public.track_likes l, me where l.profile_id = me.uid
  ),
  cand as (
    select k.track_id, max(k.created_at) as last_kept, count(distinct k.profile_id) as keepers,
      (array_agg(k.profile_id order by k.created_at desc))[1] as sharer,
      bool_or(exists (select 1 from public.follows f, me where f.follower_id = me.uid and f.followee_id = k.profile_id)) as followed
    from public.keep_decisions k, me
    where k.decision = 'KEPT' and k.visibility = 'PUBLIC' and k.profile_id <> me.uid and k.created_at > now() - interval '90 days'
    group by k.track_id
  )
  select t.id, t.title, t.artist, t.album, t.artwork_url, t.preview_url, t.genres,
    round((coalesce((select sum(ta.weight) from taste ta where ta.genre = any (select lower(trim(x)) from unnest(coalesce(t.genres, array[]::text[])) x)), 0)
      + 2.0 * (case when c.followed then 1 else 0 end)
      + 0.7 * ln(1 + (select count(*) from public.track_likes l2 where l2.track_id = t.id))
      + 0.4 * ln(1 + c.keepers)
      + 1.0 * greatest(0, 1 - extract(epoch from (now() - c.last_kept)) / (86400 * 90)))::numeric, 3) as score,
    concat_ws(' · ',
      (select 'Ton style : ' || string_agg(initcap(ta.genre), ', ') from (select ta2.genre from taste ta2 where ta2.weight > 0 and ta2.genre = any (select lower(trim(x)) from unnest(coalesce(t.genres, array[]::text[])) x) order by ta2.weight desc limit 2) ta),
      case when c.followed then 'gardé par un de tes abonnements' end,
      case when c.keepers > 1 then c.keepers::text || ' membres l''ont gardé' end) as reason,
    (select p.username from public.profiles p where p.id = c.sharer) as source_username
  from cand c
  join public.tracks t on t.id = c.track_id
  where t.preview_url is not null and not exists (select 1 from excluded e where e.tid = t.id::text)
  order by 8 desc, c.last_kept desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$function$;

revoke all on function public.keep_my_taste_profile() from public, anon;
grant execute on function public.keep_my_taste_profile() to authenticated;
revoke all on function public.keep_recommend_for_me(integer) from public, anon;
grant execute on function public.keep_recommend_for_me(integer) to authenticated;
