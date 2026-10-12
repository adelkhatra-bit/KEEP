-- Protect ticket purchases: no payment request for unapproved, ended or
-- restricted events, even when someone knows the event UUID.
-- Keep existing PayPal and seller-confirmed payment flow unchanged.
DO $loki_ticket_visibility$
DECLARE
  v_old text;
  v_new text;
  v_old_check text := 'if v_event.id is null then raise exception ''EVENT_NOT_FOUND''; end if;';
  v_new_check text := $check$
if v_event.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.is_disabled or v_event.moderation_status::text <> 'APPROVED'
     or coalesce(v_event.ends_at, v_event.starts_at + interval '6 hours') <= now() then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;
  if v_event.audience_mode = 'ADULTS_18_PLUS'
     and not coalesce((select p.is_adult from public.profiles p where p.id=uid), false) then
    raise exception 'EVENT_ADULT_ONLY';
  end if;
$check$;
BEGIN
  v_old := pg_get_functiondef(to_regprocedure('public.keep_event_request_ticket_purchase(uuid)'));
  IF v_old IS NULL OR strpos(v_old,v_old_check)=0 THEN
    RAISE EXCEPTION 'Loki ticket RPC changed unexpectedly; cannot safely patch';
  END IF;
  v_new := replace(v_old,v_old_check,v_new_check);
  IF v_new = v_old OR v_new NOT ILIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'Loki ticket purchase safety patch not applied';
  END IF;
  EXECUTE v_new;
END;
$loki_ticket_visibility$;

-- Approval freezes the organizer's ticket price as well as the event content.
-- Prevent a direct authenticated RPC call from changing a published price.
DO $loki_ticket_price_lock$
DECLARE
  v_old text;
  v_new text;
  v_marker text := $old$
  update public.events set ticket_price_cents = p_price_cents
  where id = p_event_id and creator_id = uid;
$old$;
  v_replacement text := $new$
  if exists (
    select 1 from public.events e where e.id=p_event_id
      and e.creator_id=uid and e.moderation_status::text='APPROVED'
  ) then
    raise exception 'event_locked_after_approval';
  end if;
  update public.events set ticket_price_cents = p_price_cents
  where id = p_event_id and creator_id = uid;
$new$;
BEGIN
  v_old := pg_get_functiondef(to_regprocedure('public.keep_event_set_ticket_price(uuid,integer)'));
  IF v_old IS NULL OR strpos(v_old,v_marker)=0 THEN
    RAISE EXCEPTION 'Loki event ticket price RPC changed unexpectedly';
  END IF;
  v_new := replace(v_old,v_marker,v_replacement);
  IF v_new = v_old OR v_new NOT ILIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'Loki approved event price safety patch failed';
  END IF;
  EXECUTE v_new;
END;
$loki_ticket_price_lock$;
