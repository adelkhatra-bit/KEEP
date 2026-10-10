-- Adel (10/10/2026) : connexion app + Super Admin impossible, base qui expire par moments (timeouts, requête à 60 s).
-- Pause RÉVERSIBLE des 4 tâches les plus fréquentes et non essentielles à la connexion (déjà appliquée en production).
-- Pour reprendre : select cron.alter_job(<jobid>, active := true); (jobids 18, 19, 22, 26)
-- Conservés : push worker, relance e-mails, rappels de paiement, crédits mensuels, synchro favoris.
select cron.alter_job(18, active := false); -- loki-playlist-sale-targeted-fanout (chaque minute)
select cron.alter_job(19, active := false); -- loki-public-track-fanout (chaque minute)
select cron.alter_job(22, active := false); -- keep-battle-sparse-catalog-seed (toutes les 3 min)
select cron.alter_job(26, active := false); -- keep-world-catalog-expand-every-five-minutes (toutes les 5 min)
