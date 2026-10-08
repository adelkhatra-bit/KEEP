do $$
begin
  perform cron.unschedule('keep-battle-sparse-catalog-seed');
exception when others then
  null;
end $$;

select cron.schedule(
  'keep-battle-sparse-catalog-seed',
  '*/3 * * * *',
  $cron$
  with cfg as (
    select array[
      'TECHNO','TRANCE','DNB','DUBSTEP','UK_GARAGE','GRIME','DRILL','PUNK',
      'GOSPEL','DANCEHALL','SALSA','BACHATA','CUMBIA','MERENGUE','FLAMENCO',
      'FADO','ZOUK','KOMPA','GNAWA','CHAABI','JPOP','ANIME','CPOP','MANDOPOP',
      'PUNJABI','AFROHOUSE','LOFI','AMAPIANO','HOUSE','METAL','BLUES','AFROPOP',
      'AFRO_FUSION','BAILE_FUNK','PAGODE','HARD_ROCK','INDIE','FOLK','VOCAL',
      'SINGER_SONGWRITER','INSTRUMENTAL','AMBIENT','NEW_AGE','EGYPTIAN_POP',
      'KHALEEJI'
    ]::text[] as themes
  ),
  picked as (
    select themes[
      1 + (
        floor(extract(epoch from now()) / 180)::bigint
        % array_length(themes, 1)
      )::int
    ] as theme
    from cfg
  )
  select net.http_post(
    url := 'https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-battle-catalog-seed',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-keep-cron-key',(
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'keep_battle_catalog_cron_key'
        limit 1
      )
    ),
    body := jsonb_build_object('theme', theme, 'batch', 0),
    timeout_milliseconds := 25000
  )
  from picked;
  $cron$
);
