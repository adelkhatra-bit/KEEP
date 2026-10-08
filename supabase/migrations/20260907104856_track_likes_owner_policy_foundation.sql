-- Policy historique présente sur Supabase mais absente du replay Git.
-- Elle est redondante avec les policies d'action spécialisées, mais sa
-- présence est attendue par l'optimisation RLS 20260907104900.

drop policy if exists "track_likes_owner" on public.track_likes;

create policy "track_likes_owner"
on public.track_likes
for all
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));
