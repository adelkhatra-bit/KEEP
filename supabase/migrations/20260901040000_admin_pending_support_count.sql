-- Demande d'Adel (01/09/2026) : une cloche de notification dans Super Admin
-- pour savoir sans avoir à cliquer partout s'il y a un message utilisateur
-- en attente de réponse. RPC dédiée car "le dernier message du ticket est
-- de l'utilisateur" est une sous-requête corrélée, pas exprimable proprement
-- via les filtres PostgREST côté client.

create or replace function public.admin_pending_support_count()
returns integer
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select count(*)::integer
  from public.support_tickets t
  where t.status not in ('RESOLVED','CLOSED')
    and (
      select m.sender_role from public.support_ticket_messages m
      where m.ticket_id = t.id
      order by m.created_at desc
      limit 1
    ) = 'USER'
    and public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','SUPPORT','MODERATOR']);
$function$;
