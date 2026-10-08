-- Issue #50 : journal privé des refus, sans décision de goût ni débit FREE.
create table if not exists public.keep_recognition_corrections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  correction_key text not null check (length(correction_key) between 1 and 160),
  proposed_track jsonb not null check (jsonb_typeof(proposed_track) = 'object'),
  chosen_track jsonb check (chosen_track is null or jsonb_typeof(chosen_track) = 'object'),
  engine text not null check (length(engine) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (profile_id, correction_key)
);
alter table public.keep_recognition_corrections enable row level security;
revoke all on public.keep_recognition_corrections from anon, authenticated;
grant select, insert, update on public.keep_recognition_corrections to authenticated;
grant all on public.keep_recognition_corrections to service_role;

create policy recognition_corrections_read on public.keep_recognition_corrections
  for select to authenticated using (
    profile_id = auth.uid()
    or coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN']), false)
  );
create policy recognition_corrections_insert on public.keep_recognition_corrections
  for insert to authenticated with check (
    profile_id = auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
  );
create policy recognition_corrections_update on public.keep_recognition_corrections
  for update to authenticated using (
    profile_id = auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
  ) with check (
    profile_id = auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
  );
