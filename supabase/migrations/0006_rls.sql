-- KEEP — 0006: Row Level Security
-- Principe : un utilisateur ne voit/modifie que ses propres données privées ;
-- le contenu marqué is_public est lisible par tous les utilisateurs authentifiés
-- (jamais par anon, sauf le nécessaire pour le web public — voir policies dédiées
-- côté service role dans packages/backend, pas via anon key).

alter table profiles enable row level security;
alter table profile_private_info enable row level security;
alter table social_links enable row level security;
alter table provider_links enable row level security;
alter table follows enable row level security;
alter table tracks enable row level security;
alter table playlists enable row level security;
alter table playlist_tracks enable row level security;
alter table keep_decisions enable row level security;
alter table routing_weights enable row level security;
alter table router_config_versions enable row level security;
alter table subscriptions enable row level security;
alter table transactions enable row level security;
alter table refunds enable row level security;
alter table events enable row level security;
alter table event_rsvps enable row level security;
alter table event_reports enable row level security;
alter table admin_users enable row level security;
alter table audit_logs enable row level security;

-- PROFILES
create policy profiles_select_own_or_public on profiles
  for select using (id = auth.uid() or is_public);
create policy profiles_update_own on profiles
  for update using (id = auth.uid());
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

-- PROFILE_PRIVATE_INFO — jamais public, propriétaire uniquement (date de
-- naissance / genre facultatifs, protection des mineurs).
create policy profile_private_info_owner on profile_private_info
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- SOCIAL_LINKS / PROVIDER_LINKS — jamais publics par défaut, gérés par le owner uniquement.
create policy social_links_owner on social_links
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy provider_links_owner on provider_links
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- FOLLOWS — lecture publique (compteurs), écriture par le follower uniquement.
create policy follows_select_all on follows for select using (true);
create policy follows_insert_self on follows
  for insert with check (follower_id = auth.uid());
create policy follows_delete_self on follows
  for delete using (follower_id = auth.uid());

-- TRACKS — référentiel partagé, lecture publique, écriture réservée au backend (service role).
create policy tracks_select_all on tracks for select using (true);

-- PLAYLISTS — privées par défaut.
create policy playlists_select_own_or_public on playlists
  for select using (owner_id = auth.uid() or is_public);
create policy playlists_owner_write on playlists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy playlist_tracks_via_playlist on playlist_tracks
  for select using (
    exists (select 1 from playlists p where p.id = playlist_id and (p.owner_id = auth.uid() or p.is_public))
  );
create policy playlist_tracks_owner_write on playlist_tracks
  for all using (
    exists (select 1 from playlists p where p.id = playlist_id and p.owner_id = auth.uid())
  );

-- KEEP_DECISIONS / ROUTING_WEIGHTS — strictement privé (apprentissage personnel).
create policy keep_decisions_owner on keep_decisions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy routing_weights_owner on routing_weights
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy router_config_read_all on router_config_versions for select using (true);

-- SUBSCRIPTIONS / TRANSACTIONS / REFUNDS — privé au titulaire, écriture réservée au backend.
create policy subscriptions_owner_select on subscriptions
  for select using (profile_id = auth.uid());
create policy transactions_owner_select on transactions
  for select using (profile_id = auth.uid());
create policy refunds_owner_select on refunds
  for select using (
    exists (select 1 from transactions t where t.id = transaction_id and t.profile_id = auth.uid())
  );

-- EVENTS — lecture publique (sauf désactivés/signalés massivement), écriture par le créateur.
create policy events_select_public on events
  for select using (is_disabled = false);
create policy events_creator_write on events
  for all using (creator_id = auth.uid()) with check (creator_id = auth.uid());

create policy event_rsvps_select_own on event_rsvps
  for select using (profile_id = auth.uid());
create policy event_rsvps_write_own on event_rsvps
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy event_reports_insert_authenticated on event_reports
  for insert with check (reported_by = auth.uid());

-- ADMIN_USERS / AUDIT_LOGS — jamais accessibles via anon/authenticated normal ;
-- uniquement via service role côté Super Admin backend.
create policy admin_users_none on admin_users for all using (false);
create policy audit_logs_none on audit_logs for all using (false);
