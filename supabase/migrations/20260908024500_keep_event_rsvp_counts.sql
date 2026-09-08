-- Adel 08/09/2026 : "il aura le nombre d'utilisateurs qui participe, ceux
-- qui participent, ceux qui repondront plus tard" -- compteur par reponse,
-- visible par l'organisateur (et n'importe qui, ce n'est qu'un total, pas
-- une liste nominative).
CREATE OR REPLACE FUNCTION public.keep_event_rsvp_counts(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'going', count(*) filter (where status = 'GOING'),
    'maybe', count(*) filter (where status = 'MAYBE'),
    'notGoing', count(*) filter (where status = 'NOT_GOING')
  )
  from public.event_rsvps
  where event_id = p_event_id;
$function$;

revoke all on function public.keep_event_rsvp_counts(uuid) from public;
grant execute on function public.keep_event_rsvp_counts(uuid) to anon, authenticated;
