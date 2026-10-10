-- Adel (10/10/2026) : connexion app + Super Admin impossible, base qui expire par moments (timeouts, requête à 60 s).
-- Pause RÉVERSIBLE des 4 tâches les plus fréquentes et non essentielles à la connexion (déjà appliquée en production).
-- Pour reprendre : select cron.alter_job(<jobid>, active := true); (jobids 18, 19, 22, 26)
-- Conservés : push worker, relance e-mails, rappels de paiement, crédits mensuels, synchro favoris.
-- Rejouable : sans pg_cron, ou avec le simulacre du CI (cron.alter_job sans paramètre « active »), la migration ne fait rien.
do $$
declare
  r record;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  for r in
    select jobid
    from cron.job
    where jobname in (
      'loki-playlist-sale-targeted-fanout',           -- 18, chaque minute
      'loki-public-track-fanout',                     -- 19, chaque minute
      'keep-battle-sparse-catalog-seed',              -- 22, toutes les 3 min
      'keep-world-catalog-expand-every-five-minutes'  -- 26, toutes les 5 min
    )
  loop
    begin
      execute format('select cron.alter_job(%s, active := false)', r.jobid);
    exception when undefined_function then
      null; -- simulacre de pg_cron (CI) : pas de paramètre « active »
    end;
  end loop;
end
$$;
