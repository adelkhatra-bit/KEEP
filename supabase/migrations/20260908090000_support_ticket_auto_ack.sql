-- Adel (08/09/2026) : "lorsque l'utilisateur a envoye une demande il faut
-- un message automatique qui part pour dire qu'un super admin est en train
-- de traiter sa demande" -- trigger cote serveur (jamais oubliable par un
-- bug client) : des qu'un ticket support est cree, un message SYSTEM
-- d'accuse de reception part immediatement dans la conversation.

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
    'Merci, ta demande a bien été reçue. Un membre de l’équipe Loki la traite dès que possible.',
    jsonb_build_object('auto_ack', true)
  );
  return new;
end;
$$;

drop trigger if exists trg_support_ticket_auto_ack on public.support_tickets;
create trigger trg_support_ticket_auto_ack
  after insert on public.support_tickets
  for each row execute function public.support_ticket_auto_ack();
