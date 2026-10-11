-- Visible copy only: user-facing support/system wording must say Loki, never "équipe Loki".
create or replace function public.support_ticket_auto_ack()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.support_ticket_messages(ticket_id, sender_profile_id, sender_role, body, metadata)
  values (
    new.id,
    null,
    'SYSTEM',
    'Merci, ta demande a bien été reçue. Loki la traite dès que possible.',
    jsonb_build_object('auto_ack', true)
  );
  return new;
end;
$$;

update public.support_ticket_messages
set body = replace(
  replace(body, 'Un membre de l’équipe Loki la traite dès que possible.', 'Loki la traite dès que possible.'),
  'Un membre de l''équipe Loki la traite dès que possible.', 'Loki la traite dès que possible.'
)
where body ilike '%équipe Loki%';

update public.notifications
set
  title = replace(replace(title, 'KEEP Music', 'Loki Music'), 'KEEP', 'Loki'),
  body = replace(
    replace(
      replace(body, 'l''équipe Loki Music', 'Loki Music'),
      'KEEP Music', 'Loki Music'
    ),
    'KEEP', 'Loki'
  )
where upper(coalesce(title,'')) like '%KEEP%'
   or upper(coalesce(body,'')) like '%KEEP%'
   or lower(coalesce(body,'')) like '%équipe loki%';
