-- Follow-up additive de la répartition équitable des styles Battle.
-- La migration 20261004004000 reste immuable. Ici on verrouille simplement
-- l'helper interne et on vérifie que le moteur de tirage l'utilise bien.

revoke all on function public.keep_battle_arena_fair_theme_codes(uuid,integer)
from public,anon,authenticated;

do $migration$
declare
  ddl text;
begin
  select pg_get_functiondef('public.keep_battle_arena_seed_rounds(uuid,integer)'::regprocedure)
  into ddl;

  if strpos(ddl,'keep_battle_arena_fair_theme_codes')=0 then
    raise exception 'BATTLE_FAIR_STYLE_MIX_NOT_ACTIVE';
  end if;
end;
$migration$;
