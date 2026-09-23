-- Ajoute la valeur DRAFT à l'enum de modération d'événement.
-- Postgres 15 (Supabase) autorise ADD VALUE en transaction ;
-- la valeur ne peut simplement pas être RÉUTILISÉE dans la même transaction.
ALTER TYPE public.event_moderation_status ADD VALUE IF NOT EXISTS 'DRAFT';
