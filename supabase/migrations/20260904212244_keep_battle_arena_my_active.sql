-- Adel (04/09/2026) : "lorsqu'un utilisateur sans faire exprès passe sur une
-- autre page, il faut que lorsqu'il revienne automatiquement si il est dans
-- le match, il revienne même s'il a loupé un ou deux morceaux" -- BUG RÉEL
-- confirmé : PartiesScreen démonte tout KeepBattleArenaPanel quand
-- battleOpen passe à false (changement d'onglet), perdant l'état local
-- `arena`. Au retour, plus aucun moyen pour le client de savoir "je suis
-- déjà actif dans une arène" sans redemander explicitement -- aucune RPC de
-- ce type n'existait. Reprend exactement le même repérage que la première
-- étape de keep_battle_arena_matchmake (siège ACTIF dans une arène encore
-- WAITING/ACTIVE et non expirée).
create or replace function public.keep_battle_arena_my_active()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select ar.* into a from public.keep_battle_arena_members m join public.keep_battle_arenas ar on ar.id=m.arena_id
  where m.profile_id=uid and m.seat_status='ACTIVE' and ar.status in('WAITING','ACTIVE') and ar.expires_at>now()
  order by m.joined_at desc limit 1;
  if not found then return null; end if;
  return public.keep_battle_arena_state(a.id);
end;
$function$;
