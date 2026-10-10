-- Personal taste recommendations must not bypass Pulse's three-day shown cooldown or replay kept/hidden tracks.
CREATE OR REPLACE FUNCTION public.keep_recommend_for_me(p_limit integer DEFAULT 20)
 RETURNS TABLE(track_id uuid, title text, artist text, album text, artwork_url text, preview_url text, genres text[], score numeric, reason text, source_username text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  taste as (select genre, weight from public.keep_my_taste_profile()),
  excluded as (
    select k.track_id::text as tid from public.keep_decisions k, me where k.profile_id = me.uid and k.decision = 'KEPT'
    union select d.track_id from public.track_dislikes d, me where d.profile_id = me.uid
    union select l.track_id::text from public.track_likes l, me where l.profile_id = me.uid
    union select e.track_id::text from public.profile_loki_pulse_events e, me where e.profile_id=me.uid and (e.last_shown_at >= now() - interval '3 days' or e.kept_at is not null or e.hidden_at is not null)
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
$function$

