-- Adel (03/09/2026) : "quand j'appuie sur revanche, pareil, ça me met une
-- invite fixe" -- pour qu'un membre qui n'a PAS l'arène ouverte (accueil
-- Battle, "Joueurs disponibles", classement) puisse quand même voir et
-- répondre à une revanche proposée, il faut un moyen de savoir "ai-je une
-- revanche en attente de ma réponse, où que je sois dans l'app" -- ce que
-- ni `keep_battle_challenges` (1v1 frais uniquement) ni l'état d'arène déjà
-- chargé ne peuvent donner. Ne renvoie que les revanches encore dans les
-- temps (rematch_deadline > now()) où JE n'ai pas encore répondu
-- (rematch_ready is null) -- dès que je réponds ou que le délai expire,
-- cette ligne disparaît d'elle-même de la prochaine lecture.
create or replace function public.keep_battle_arena_pending_rematch_for_me()
returns table(arena_id uuid, arena_code text, theme_code text, rematch_deadline timestamptz, participant_usernames text[])
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.id, a.arena_code, a.theme_code, a.rematch_deadline,
    (select array_agg(coalesce(nullif(p2.username,''),'KEEP') order by p2.username)
     from public.keep_battle_arena_members m2
     join public.profiles p2 on p2.id = m2.profile_id
     where m2.arena_id = a.id and m2.profile_id <> auth.uid()) as participant_usernames
  from public.keep_battle_arenas a
  join public.keep_battle_arena_members me on me.arena_id = a.id and me.profile_id = auth.uid()
  where a.rematch_deadline is not null and a.rematch_deadline > now() and me.rematch_ready is null;
$function$;
