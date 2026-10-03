-- Loki Music · préservation de l'historique des notifications.
-- La migration 20261003038000 est déjà appliquée et reste immuable.
-- Ce correctif additif désactive uniquement le mécanisme FUTUR qui effaçait
-- une notification Boutique lorsqu'une notification Nouveau morceau arrivait.
-- Aucune ligne de notifications n'est supprimée ici.

drop trigger if exists trg_public_music_supersedes_boutique on public.notifications;
drop function if exists public.keep_public_music_supersedes_boutique();

-- keep_boutique_notification_insert_guard reste actif : il bloque les nouvelles
-- alertes Boutique redondantes sans modifier l'historique déjà présent.
