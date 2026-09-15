-- Demande d'Adel (01/09/2026) : un utilisateur pouvait enchaîner des
-- dizaines de messages/tickets support sans qu'aucune réponse admin ne soit
-- nécessaire entre deux -- aucun garde-fou nulle part (vérifié dans
-- supportCenterService.ts : createSupportTicket/replyToSupportTicket
-- n'imposaient aucune limite). Deux règles, appliquées côté base pour ne pas
-- dépendre du client :
--   1. Dans un ticket donné, un utilisateur ne peut pas envoyer un nouveau
--      message tant que le dernier message de ce ticket est aussi de lui
--      (empêche le flood dans une même conversation).
--   2. Un utilisateur ne peut pas avoir plus de 3 tickets ouverts et sans
--      aucune réponse admin/système en parallèle (empêche de contourner la
--      règle 1 en créant plein de nouveaux tickets à la place).
-- La réponse de l'admin (déjà pleinement fonctionnelle côté Super Admin,
-- voir packages/admin/pages/support-center.tsx) n'est jamais bloquée.

create or replace function public.keep_support_ticket_flood_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  open_unanswered_count integer;
begin
  select count(*) into open_unanswered_count
  from public.support_tickets t
  where t.profile_id = new.profile_id
    and t.status not in ('RESOLVED','CLOSED')
    and not exists (
      select 1 from public.support_ticket_messages m
      where m.ticket_id = t.id and m.sender_role in ('ADMIN','SYSTEM')
    );

  if open_unanswered_count >= 3 then
    raise exception 'SUPPORT_TOO_MANY_OPEN_TICKETS';
  end if;

  return new;
end;
$function$;

drop trigger if exists keep_support_ticket_flood_guard_trigger on public.support_tickets;
create trigger keep_support_ticket_flood_guard_trigger
before insert on public.support_tickets
for each row execute function public.keep_support_ticket_flood_guard();

create or replace function public.keep_support_message_flood_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  last_sender text;
begin
  if new.sender_role <> 'USER' then
    return new;
  end if;

  select sender_role into last_sender
  from public.support_ticket_messages
  where ticket_id = new.ticket_id
  order by created_at desc
  limit 1;

  if last_sender = 'USER' then
    raise exception 'SUPPORT_AWAITING_REPLY';
  end if;

  return new;
end;
$function$;

drop trigger if exists keep_support_message_flood_guard_trigger on public.support_ticket_messages;
create trigger keep_support_message_flood_guard_trigger
before insert on public.support_ticket_messages
for each row execute function public.keep_support_message_flood_guard();
