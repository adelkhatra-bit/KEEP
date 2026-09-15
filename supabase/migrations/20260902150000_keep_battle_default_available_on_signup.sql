-- Adel (02/09/2026) : "je pense qu'on va les laisser connecté par défaut ...
-- lors de la première inscription. Ensuite si l'utilisateur se déconnecte,
-- le système enregistrera qu'il a déconnecté" -- un nouveau profil démarre
-- maintenant "disponible pour un Battle" par défaut ; seul un geste EXPLICITE
-- de l'utilisateur (bascule du profil) peut ensuite le désactiver. Ne touche
-- jamais les profils EXISTANTS (le trigger ne réagit qu'à une création).
create or replace function public.keep_battle_default_available_on_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.keep_battle_solo_presence(profile_id, theme_code, status, manual_available, last_seen_at)
  values (new.id, 'MIX', 'SOLO', true, now())
  on conflict (profile_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists keep_battle_default_available_on_signup_trg on public.profiles;
create trigger keep_battle_default_available_on_signup_trg
after insert on public.profiles
for each row execute function public.keep_battle_default_available_on_signup();

-- Lecture de mon propre état -- nécessaire pour que le client synchronise
-- le state local (useBattleAvailabilityStore) sur la vraie valeur serveur au
-- démarrage, au lieu de toujours partir de "false" côté client.
create or replace function public.keep_battle_get_manual_availability()
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce((select manual_available from public.keep_battle_solo_presence where profile_id = auth.uid()), false);
$function$;

revoke all on function public.keep_battle_get_manual_availability() from public;
grant execute on function public.keep_battle_get_manual_availability() to authenticated, anon;
