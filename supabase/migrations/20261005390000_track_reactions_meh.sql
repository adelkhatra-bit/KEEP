-- Réactions en 3 choix (Adel 05/10/2026, IDEA-110) : aimer (track_likes), bof et pas aimé (track_dislikes.reaction). Additif ; aucune suppression.
alter table public.track_dislikes add column if not exists reaction text not null default 'DISLIKE' check (reaction in ('DISLIKE', 'MEH'));

-- Compteurs « pas aimé » et « bof » sur MES musiques partagées (comptes seulement, jamais l'identité).
create or replace function public.keep_my_track_reaction_counts(p_track_ids text[])
returns table(track_id text, dislikes integer, mehs integer) language sql stable security definer set search_path to 'public' as $function$
  select d.track_id,
    (count(*) filter (where d.reaction = 'DISLIKE'))::integer,
    (count(*) filter (where d.reaction = 'MEH'))::integer
  from public.track_dislikes d
  where d.track_id = any (select left(x, 80) from unnest(p_track_ids) x limit 200)
    and (exists (select 1 from public.keep_decisions k where k.profile_id = auth.uid() and k.decision = 'KEPT' and k.track_id::text = d.track_id)
      or exists (select 1 from public.story_pins sp where sp.profile_id = auth.uid() and sp.track_id::text = d.track_id))
  group by d.track_id;
$function$;
revoke all on function public.keep_my_track_reaction_counts(text[]) from public, anon;
grant execute on function public.keep_my_track_reaction_counts(text[]) to authenticated;
