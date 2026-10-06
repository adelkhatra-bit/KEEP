-- Fix 22/09/2026: plusieurs RPC historiques inséraient la valeur
-- "pending" en minuscules dans notifications.push_delivery_status alors que
-- la contrainte n'autorise que CREATED/NO_DEVICE/SENT/DELIVERED/FAILED.
-- Résultat visible côté mobile : "new row for relation notifications violates
-- check constraint notifications_push_delivery_status_check" lors de la mise
-- en vente d'une sélection.
--
-- Ce garde-fou normalise les anciennes écritures sans élargir la contrainte :
-- "pending" signifie simplement "créée, pas encore traitée" => CREATED.
-- Les statuts valides restent canoniques en majuscules.

create or replace function public.keep_normalize_notification_push_delivery_status()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.push_delivery_status is null then
    new.push_delivery_status := 'CREATED';
  elsif lower(new.push_delivery_status) = 'pending' then
    new.push_delivery_status := 'CREATED';
  elsif upper(new.push_delivery_status) in ('CREATED','NO_DEVICE','SENT','DELIVERED','FAILED') then
    new.push_delivery_status := upper(new.push_delivery_status);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_keep_normalize_notification_push_delivery_status on public.notifications;
create trigger trg_keep_normalize_notification_push_delivery_status
before insert or update of push_delivery_status on public.notifications
for each row
execute function public.keep_normalize_notification_push_delivery_status();

update public.notifications
set push_delivery_status = 'CREATED'
where lower(push_delivery_status) = 'pending';
