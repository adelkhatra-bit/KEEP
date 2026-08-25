-- KEEP — 0015: LIKE (distinct de KEEP), provenance, visibilité par morceau
-- (cf. demande explicite du 24/08/2026, plusieurs sections du même message).
--
-- Aucun système like/favorite n'existait avant (recherché explicitement
-- dans schéma+code avant d'écrire ceci, comme demandé -- confirmé absent).

-- ---- LIKE (interaction sociale, distinct de KEEP -- voir keep_decisions) ----
create table if not exists track_likes (
  profile_id uuid not null references profiles(id) on delete cascade,
  track_id uuid not null references tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, track_id)
);
create index if not exists idx_track_likes_track on track_likes(track_id);

alter table track_likes enable row level security;
-- Lecture publique (compteur de likes affiché sur n'importe quel profil
-- public) -- même raisonnement que follows_select_all (0006_rls.sql).
create policy track_likes_select_all on track_likes for select using (true);
create policy track_likes_owner on track_likes for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---- PROVENANCE (cf. demande explicite -- "source_user = Adel, source_type = profile") ----
alter table keep_decisions add column if not exists source_user_id uuid references profiles(id);
alter table keep_decisions add column if not exists source_type text check (source_type in ('profile', 'share_link', null));
comment on column keep_decisions.source_user_id is 'Si ce KEEP vient du profil d''un autre utilisateur (KEEP THIS TRACK) : qui. NULL = découverte directe (reconnaissance), pas via un autre profil.';

-- ---- VISIBILITÉ PAR MORCEAU (cf. demande explicite -- "publique, masquée, privée, même si masquée elle reste dans la bibliothèque personnelle") ----
alter table keep_decisions add column if not exists visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC', 'FOLLOWERS', 'PRIVATE'));
comment on column keep_decisions.visibility is 'Visibilité SUR LE PROFIL uniquement -- ne retire jamais le morceau de la bibliothèque personnelle (Mes KEEP), seulement de ce que les visiteurs voient.';
