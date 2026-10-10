-- Adel (10/10/2026) : connexion app + Super Admin impossible, base qui expire par moments (timeouts, requête à 60 s).
-- Pause RÉVERSIBLE des 4 tâches les plus fréquentes et non essentielles à la connexion (déjà appliquée en production).
-- Pour reprendre : select cron.alter_job(<jobid>, active := true); (jobids 18, 19, 22, 26)
-- Conservés : push worker, relance e-mails, rappels de paiement, crédits mensuels, synchro favoris.
-- Rejouable : sur une base neuve (CI, local) sans pg_cron ou sans ces tâches, la migration ne fait rien.
do $$
begin
  if to_regnamespace('cron') is not null
     and exists (select 1 from information_schema.routines where routine_schema = 'cron' and routine_name = 'alter_job')
     and to_regclass('cron.job') is not null then
    perform cron.alter_job(j.jobid, active := false)
    from cron.job j
    where j.jobname in (
      'loki-playlist-sale-targeted-fanout',      -- 18, chaque minute
      'loki-public-track-fanout',                -- 19, chaque minute
      'keep-battle-sparse-catalog-seed',         -- 22, toutes les 3 min
      'keep-world-catalog-expand-every-five-minutes' -- 26, toutes les 5 min
    );
  end if;
end
$$;
