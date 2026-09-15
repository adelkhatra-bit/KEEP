-- Adel 08/09/2026 : "il aura la possibilite de voir tous les participants"
-- -- liste nominative reservee a l'organisateur de l'evenement (pas
-- publique, contrairement aux compteurs agreges de keep_event_rsvp_counts).
CREATE OR REPLACE FUNCTION public.keep_event_participants(p_event_id uuid)
 RETURNS TABLE(
   profile_id uuid,
   username text,
   certification_tier text,
   status text,
   responded_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.events e where e.id = p_event_id and e.creator_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select
    p.id,
    p.username,
    case
      when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
      when plan.code = 'VENUE_PRO' then 'VENUE_PRO'
      when plan.code = 'CREATOR_PRO' then 'CREATOR_PRO'
      when plan.code = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text,
    r.status::text,
    r.updated_at
  from public.event_rsvps r
  join public.profiles p on p.id = r.profile_id
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
  where r.event_id = p_event_id
  order by case r.status when 'GOING' then 0 when 'MAYBE' then 1 else 2 end, r.updated_at desc
  limit 500;
end;
$function$;

revoke all on function public.keep_event_participants(uuid) from public;
grant execute on function public.keep_event_participants(uuid) to authenticated;
