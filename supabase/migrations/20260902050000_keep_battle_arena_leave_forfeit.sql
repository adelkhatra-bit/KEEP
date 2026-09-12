-- Adel (02/09/2026) : "je suis sorti du Battle sans faire exprès et le Battle
-- il tourne encore ... je n'ai même pas pu reprendre la partie" + sur le
-- compte @inside : "je n'arrive plus à sortir du Battle ... il faut que
-- lorsqu'ils sont deux, il y en a un qui sort automatiquement celui qui est
-- sorti a perdu et celui qui est resté a gagné". Root cause : fermer l'écran
-- Battle (× ou "QUITTER LE BATTLE") ne prévenait jamais le serveur -- le
-- siège du joueur restait 'ACTIVE' pour toujours, la partie n'était donc
-- jamais résolue côté serveur (le crédit misé du partant restait bloqué,
-- l'autre joueur ne gagnait jamais). Cette RPC marque le siège du partant
-- ELIMINATED et, si la partie était ACTIVE et qu'il ne reste qu'un seul
-- joueur actif, déclenche immédiatement keep_battle_arena_finish_match (déjà
-- utilisé en fin de manche normale) pour que le joueur resté gagne par forfait
-- et que les mises soient réglées normalement.
create or replace function public.keep_battle_arena_leave(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  active_count integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found then return; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id = a.id and profile_id = uid and seat_status = 'ACTIVE') then
    return;
  end if;
  update public.keep_battle_arena_members set seat_status = 'ELIMINATED' where arena_id = a.id and profile_id = uid;
  if a.status = 'ACTIVE' then
    select count(*) into active_count from public.keep_battle_arena_members where arena_id = a.id and seat_status = 'ACTIVE';
    if active_count < 2 then
      perform public.keep_battle_arena_finish_match(a.id);
    end if;
  end if;
end;
$function$;
