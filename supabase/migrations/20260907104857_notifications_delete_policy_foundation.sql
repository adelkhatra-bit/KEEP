-- Policy présente sur Supabase mais absente de l'historique Git.
-- Fondation idempotente avant l'optimisation RLS du 07/09.

drop policy if exists "notifications_delete_own" on public.notifications;

create policy "notifications_delete_own"
on public.notifications
for delete
using (profile_id = (select auth.uid()));
