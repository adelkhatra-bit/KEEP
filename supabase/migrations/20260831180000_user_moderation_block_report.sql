-- KEEP — Modération utilisateur : signaler + bloquer (exigence Apple 1.2 UGC).
-- Aucune fonctionnalité de ce type n'existait dans le dépôt avant ce jour
-- (verifie par recherche complete sur packages/mobile/src). Apple exige les
-- quatre elements pour du contenu genere par les utilisateurs : signaler,
-- bloquer, moderation, contact publie -- le contact support existe deja
-- (verifie par scripts/verify-app-store-readiness.cjs, PASS).

create table if not exists user_blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on user_blocks(blocked_id);

alter table user_blocks enable row level security;

-- Un utilisateur ne voit et ne gere que SES PROPRES blocages -- jamais qui
-- l'a bloque lui (comportement standard : ne pas reveler cette information).
drop policy if exists user_blocks_owner on user_blocks;
create policy user_blocks_owner on user_blocks
  for all using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

create table if not exists user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  reported_user_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','inappropriate_content','impersonation','other')),
  details text,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null
);

create index if not exists user_reports_reported_idx on user_reports(reported_user_id, created_at desc);
create index if not exists user_reports_status_idx on user_reports(status, created_at desc);

alter table user_reports enable row level security;

-- Depot possible par tout utilisateur authentifie ; aucune lecture cote
-- client (ni ses propres signalements, ni ceux des autres) -- la revue se
-- fait uniquement cote Super Admin via la service role, qui contourne RLS.
drop policy if exists user_reports_insert_own on user_reports;
create policy user_reports_insert_own on user_reports
  for insert with check (reporter_id = auth.uid());

-- Verifie un blocage dans N'IMPORTE QUELLE direction entre l'appelant et
-- other_id, sans jamais reveler la ligne elle-meme (contourne le RLS
-- owner-only de user_blocks pour ce seul usage : savoir si le contenu de
-- l'autre doit rester cache, jamais qui a bloque qui en liste).
create or replace function service_is_blocked_either_way(other_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from user_blocks
     where (blocker_id = auth.uid() and blocked_id = other_id)
        or (blocker_id = other_id and blocked_id = auth.uid())
  );
$$;

revoke all on function service_is_blocked_either_way(uuid) from public;
grant execute on function service_is_blocked_either_way(uuid) to authenticated;

-- Bloquer quelqu'un annule aussi tout suivi existant dans les deux sens --
-- rester abonne a la personne qu'on vient de bloquer (ou l'inverse) n'aurait
-- aucun sens et laisserait fuiter du contenu par un autre chemin.
create or replace function block_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication_required';
  end if;
  if target_id is null or target_id = caller_id then
    raise exception 'invalid_target';
  end if;

  insert into user_blocks(blocker_id, blocked_id)
  values (caller_id, target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from follows
   where (follower_id = caller_id and followee_id = target_id)
      or (follower_id = target_id and followee_id = caller_id);
end;
$$;

revoke all on function block_user(uuid) from public;
grant execute on function block_user(uuid) to authenticated;

create or replace function unblock_user(target_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from user_blocks
   where blocker_id = auth.uid() and blocked_id = target_id;
$$;

revoke all on function unblock_user(uuid) from public;
grant execute on function unblock_user(uuid) to authenticated;

create or replace function report_user(target_id uuid, p_reason text, p_details text default null, p_context jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  new_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required';
  end if;
  if target_id is null or target_id = caller_id then
    raise exception 'invalid_target';
  end if;
  if p_reason not in ('spam','harassment','inappropriate_content','impersonation','other') then
    raise exception 'invalid_reason';
  end if;

  insert into user_reports(reporter_id, reported_user_id, reason, details, context)
  values (caller_id, target_id, p_reason, nullif(trim(coalesce(p_details, '')), ''), coalesce(p_context, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function report_user(uuid, text, text, jsonb) from public;
grant execute on function report_user(uuid, text, text, jsonb) to authenticated;
