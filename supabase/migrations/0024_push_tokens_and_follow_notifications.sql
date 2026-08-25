-- KEEP — 0024 : notifications push (boucle complète, demande explicite du 26/08/2026)
--
-- `notifications`/`notification_preferences` existaient déjà en base (appliquées
-- directement, sans migration -- gap documenté ici plutôt que réécrit). Ce qui
-- manquait réellement, vérifié avant d'écrire quoi que ce soit :
-- 1. aucune table pour stocker les tokens push Expo par appareil ;
-- 2. aucun déclencheur réel -- un "follow" (table `follows`, déjà utilisée
--    directement depuis le client mobile, jamais via une route backend) ne
--    créait jamais de ligne dans `notifications`.
--
-- Choix : un trigger Postgres plutôt qu'un hook côté client -- fiable quel que
-- soit le chemin client qui insère dans `follows` (aujourd'hui direct depuis
-- profileService.ts, potentiellement un jour via une vraie route backend), pas
-- une deuxième logique à maintenir en double.

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token text not null,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, token)
);

alter table push_tokens enable row level security;

create policy push_tokens_owner on push_tokens
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Distingue "créée" (toujours instantané, alimente le centre de notifications
-- in-app déjà réel) de "réellement envoyée en push" (fait par le backend, voir
-- packages/backend/src/lib/pushNotifications.ts -- une ligne insérée ici sans
-- token enregistré reste simplement "non poussée", jamais une erreur).
alter table notifications add column if not exists pushed_at timestamptz;

create or replace function notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_social_enabled boolean;
  follower_username text;
begin
  -- BUG REEL trouve en testant reellement (pas suppose) : nommer la variable
  -- locale "social_enabled" comme la colonne rendait la reference ambigue pour
  -- Postgres (ERROR 42702). Prefixe v_ pour lever toute ambiguite.
  select coalesce(social_enabled, true) into v_social_enabled
  from notification_preferences
  where profile_id = new.followee_id;

  if v_social_enabled is false then
    return new; -- préférence explicite de l'utilisateur -- jamais créer la notification.
  end if;

  select username into follower_username from profiles where id = new.follower_id;

  insert into notifications (id, profile_id, type, title, body, data, created_at)
  values (
    gen_random_uuid(),
    new.followee_id,
    'new_follower',
    'Nouvel abonné',
    coalesce(follower_username, 'Quelqu''un') || ' vous suit maintenant sur KEEP',
    jsonb_build_object('follower_id', new.follower_id),
    now()
  );

  return new;
end;
$$;

comment on function notify_on_follow is 'Crée une notification in-app réelle à chaque follow -- respecte notification_preferences.social_enabled, jamais de doublon de logique côté client.';

drop trigger if exists trg_notify_on_follow on follows;
create trigger trg_notify_on_follow
  after insert on follows
  for each row execute function notify_on_follow();
