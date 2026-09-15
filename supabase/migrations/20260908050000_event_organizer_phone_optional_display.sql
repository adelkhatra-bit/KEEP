-- Adel (08/09/2026) : "on a la possibilite d'integrer aussi un numero de
-- telephone qui est utilisateur qui cree l'evenement qui puisse dire, je
-- souhaite montrer mon numero de telephone ou pas" -- champ optionnel,
-- jamais visible publiquement par defaut. organizer_phone_public est une
-- colonne GENEREE (jamais ecrite directement) qui ne vaut le numero que si
-- show_organizer_phone est vrai : loadUpcomingEvents (lecture publique
-- directe, pas de RPC) ne selectionne QUE cette colonne, jamais
-- organizer_phone -- impossible de faire fuiter le numero cote reseau meme
-- si l'utilisateur inspecte la requete, contrairement a un simple filtrage
-- cote client.
alter table public.events
  add column if not exists organizer_phone text,
  add column if not exists show_organizer_phone boolean not null default false;

alter table public.events
  add column if not exists organizer_phone_public text
  generated always as (case when show_organizer_phone then organizer_phone else null end) stored;

-- Pour que l'organisateur retrouve SON numero (meme masque publiquement)
-- quand il rouvre le formulaire de modification.
create or replace function public.keep_event_my_organizer_contact(p_event_id uuid)
returns table(organizer_phone text, show_organizer_phone boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select e.organizer_phone, e.show_organizer_phone
  from public.events e
  where e.id = p_event_id and e.creator_id = v_uid;
end;
$function$;
revoke all on function public.keep_event_my_organizer_contact(uuid) from public;
grant execute on function public.keep_event_my_organizer_contact(uuid) to authenticated;
