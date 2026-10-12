-- Loki Pulse event cards: organic recommendations from actual user activity.
-- Same shared moderated Story feed; no invented ads, billing, event data or scores.
-- Preserve existing age restrictions, 24h expiry and user-specific permissions.
DO $loki_event_pulse$
DECLARE
  v_old text;
  v_new text;
  v_order_old text := $old$
  order by
    case when exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=e.creator_id) then 0 else 1 end,
    s.created_at desc
$old$;
  v_order_new text := $new$
  order by
    case
      when exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=e.creator_id) then 0
      when exists(select 1 from public.keep_decisions k where k.profile_id=auth.uid() and k.source_user_id=e.creator_id and k.decision='KEPT') then 1
      when e.country_code is not null and e.country_code=(select v.country_code from viewer v) then 2
      else 3 end,
    least((r.going_count*5 + r.maybe_count + r.checked_in_count*10),1000) desc,
    s.created_at desc
$new$;
BEGIN
  v_old := pg_get_functiondef(to_regprocedure('public.keep_event_story_list(integer)'));
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Loki event Story feed RPC missing';
  END IF;
  IF strpos(v_old,v_order_old)=0 THEN
    RAISE EXCEPTION 'Loki event Story feed ordering changed unexpectedly';
  END IF;
  v_new := replace(v_old,
    'select p.is_adult from public.profiles p where p.id=auth.uid()',
    'select p.is_adult,p.country_code from public.profiles p where p.id=auth.uid()');
  v_new := replace(v_new,v_order_old,v_order_new);
  IF v_new = v_old OR v_new NOT ILIKE '%SECURITY DEFINER%'
     OR v_new NOT ILIKE '%ADULTS_18_PLUS%' THEN
    RAISE EXCEPTION 'Loki personalized event feed fails privacy guard';
  END IF;
  EXECUTE v_new;
END;
$loki_event_pulse$;
