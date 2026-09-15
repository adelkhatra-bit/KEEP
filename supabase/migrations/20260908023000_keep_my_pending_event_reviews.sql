-- Adel 08/09/2026 : "comprendre pourquoi il a eu un flop ... systeme
-- d'etoile" -- evenements passes ou le viewer a repondu GOING et n'a pas
-- encore laisse d'avis, pour lui proposer de noter directement dans
-- l'appli.
CREATE OR REPLACE FUNCTION public.keep_my_pending_event_reviews()
 RETURNS TABLE(
   event_id uuid,
   name text,
   venue_name text,
   starts_at timestamptz,
   creator_id uuid,
   creator_username text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select e.id, e.name, e.venue_name, e.starts_at, e.creator_id, p.username
  from public.event_rsvps r
  join public.events e on e.id = r.event_id
  join public.profiles p on p.id = e.creator_id
  where r.profile_id = v_uid
    and r.status = 'GOING'
    and e.starts_at < now()
    and not exists (select 1 from public.event_reviews er where er.event_id = e.id and er.reviewer_id = v_uid)
  order by e.starts_at desc
  limit 30;
end;
$function$;

revoke all on function public.keep_my_pending_event_reviews() from public;
grant execute on function public.keep_my_pending_event_reviews() to authenticated;
