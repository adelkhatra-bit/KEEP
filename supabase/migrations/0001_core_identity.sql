-- KEEP — 0001: Identité, profils, providers musicaux, follows
-- Convention : toutes les tables utilisatrices ont `created_at`/`updated_at`.
-- RLS activé partout ; policies détaillées dans 0006_rls.sql.

create extension if not exists "pgcrypto";

create type profile_kind as enum ('USER', 'CREATOR', 'DJ', 'ARTIST', 'PRODUCER', 'VENUE');
create type link_visibility as enum ('PUBLIC', 'PRIVATE');
create type gender_option as enum ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- Étend auth.users (Supabase Auth) avec le profil KEEP.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  country_code char(2), -- ISO 3166-1 alpha-2 ; contexte pays global (cf. règle anti-mélange pays)
  city text,
  kind profile_kind not null default 'USER',
  language_code text not null default 'en',
  is_public boolean not null default true,
  onboarding_completed_at timestamptz,
  location_opt_in boolean not null default false,
  approx_lat double precision, -- localisation APPROXIMATIVE uniquement — jamais de position précise
  approx_lng double precision,
  -- Dérivé, jamais la source de vérité (voir profile_private_info) : utilisable
  -- pour un futur contrôle 18+ sans exposer la date de naissance elle-même.
  is_adult boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column profiles.approx_lat is 'Arrondi côté application avant écriture — jamais la position GPS exacte.';
comment on column profiles.is_adult is 'Calculé côté backend (service role) à partir de profile_private_info.birth_date. Jamais dérivé côté client, jamais recalculable par l''utilisateur.';

-- Données sensibles facultatives, JAMAIS jointes à une lecture publique.
-- Ni date de naissance ni genre ne sont exigés pour utiliser KEEP (§ cahier
-- des charges "profils"). Table séparée = pas de risque d'exposition
-- accidentelle via une policy `is_public` sur `profiles`.
create table if not exists profile_private_info (
  profile_id uuid primary key references profiles(id) on delete cascade,
  birth_date date,
  gender gender_option,
  updated_at timestamptz not null default now()
);

create table if not exists social_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  platform text not null, -- instagram, tiktok, facebook, snapchat, youtube, x, website, other
  url text not null,
  visibility link_visibility not null default 'PUBLIC',
  created_at timestamptz not null default now(),
  unique (profile_id, platform)
);

create table if not exists provider_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null, -- 'spotify' | 'appleMusic' | 'youtubeMusic' | 'deezer' | ...
  provider_user_id text not null,
  access_token_encrypted text not null, -- chiffré applicatif ; jamais en clair (cf. SECURITY.md)
  refresh_token_encrypted text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique (profile_id, provider)
);

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists idx_follows_followee on follows(followee_id);
create index if not exists idx_provider_links_profile on provider_links(profile_id);
create index if not exists idx_profiles_country on profiles(country_code);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Calcule profiles.is_adult à partir de profile_private_info.birth_date,
-- sans jamais exposer la date elle-même en dehors de cette table privée.
create or replace function sync_is_adult()
returns trigger language plpgsql as $$
begin
  update profiles
    set is_adult = case when new.birth_date is null then null
                        else (date_part('year', age(new.birth_date)) >= 18) end
    where id = new.profile_id;
  return new;
end;
$$;

create trigger trg_profile_private_info_sync_is_adult
  after insert or update of birth_date on profile_private_info
  for each row execute function sync_is_adult();
