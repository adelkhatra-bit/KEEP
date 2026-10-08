-- Réactions partout (Adel 05/10/2026, IDEA-109) : « pas aimé » en plus du « j'aime » (track_likes existante). Additif ; aucune suppression.
-- Une ligne par personne et par musique, visible par son auteur ; le partageur ne reçoit que des COMPTEURS (RPC), jamais qui n'a pas aimé.
create table if not exists public.track_dislikes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (profile_id, track_id)
);
alter table public.track_dislikes enable row level security;
create policy track_dislikes_select_own on public.track_dislikes for select to authenticated using (profile_id = auth.uid());
create policy track_dislikes_insert_own on public.track_dislikes for insert to authenticated with check (profile_id = auth.uid());
create index if not exists idx_track_dislikes_track_id on public.track_dislikes(track_id);

-- Nombre de « pas aimé » sur les musiques que J'AI partagées (GARDER public ou story) : réservé à leur partageur, comptes seulement.
create or replace function public.keep_my_track_dislike_counts(p_track_ids text[])
returns table(track_id text, dislikes integer) language sql stable security definer set search_path to 'public' as $function$
  select d.track_id, count(*)::integer
  from public.track_dislikes d
  where d.track_id = any (select left(x, 80) from unnest(p_track_ids) x limit 200)
    and (exists (select 1 from public.keep_decisions k where k.profile_id = auth.uid() and k.decision = 'KEPT' and k.track_id::text = d.track_id)
      or exists (select 1 from public.story_pins sp where sp.profile_id = auth.uid() and sp.track_id::text = d.track_id))
  group by d.track_id;
$function$;
revoke all on function public.keep_my_track_dislike_counts(text[]) from public, anon;
grant execute on function public.keep_my_track_dislike_counts(text[]) to authenticated;
