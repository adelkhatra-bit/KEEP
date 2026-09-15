-- Adel (02/09/2026) : "je suis sur Spotify je like une musique, est-ce que
-- c'est possible qu'elle aille directement sur notre application et située
-- dans les autres plateformes ... vice versa pour eviter les doublons" +
-- "en mode extrait ... elle va dans les sessions extrait et ensuite il peut
-- la reecouter et dire s'il va la partager ... pas automatiquement."
--
-- Deux colonnes ajoutees a music_library_items (deja existante, deja
-- provider-agnostique -- son check constraint accepte deja apple_music,
-- spotify, deezer, youtube_music, soundcloud, tidal) :
--   pending_review     : true = decouvert par la synchro automatique, pas
--                         encore une decision de l'utilisateur.
--   session_queued_at  : marque le moment ou le mobile a recupere cette
--                         ligne pour la materialiser en session Loki
--                         (empeche de la repousser deux fois).
alter table public.music_library_items
  add column if not exists pending_review boolean not null default false,
  add column if not exists session_queued_at timestamptz;

create index if not exists music_library_items_pending_idx
  on public.music_library_items(profile_id)
  where pending_review = true and session_queued_at is null;

-- Meme mecanisme d'authentification worker que keep_push_worker_key /
-- keep_internal_worker_secrets (20260830014500_keep_push_worker_cron.sql) :
-- un secret Vault + son hash SHA-256 stocke pour verification cote backend,
-- jamais le secret en clair hors du Vault.
do $worker_secret$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='keep_favorites_sync_worker_key'
  limit 1;
  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'keep_favorites_sync_worker_key','KEEP internal favorites auto-sync worker key',null);
  end if;
  insert into public.keep_internal_worker_secrets(name,secret_hash,updated_at)
  values('favorites-sync-worker',encode(extensions.digest(convert_to(v_secret,'UTF8'),'sha256'),'hex'),now())
  on conflict(name) do update set secret_hash=excluded.secret_hash,updated_at=now();
end
$worker_secret$;

-- Le moteur de synchro vit dans le backend Express (packages/backend) --
-- c'est deja la que vivent les jetons OAuth Spotify/Deezer et le rafraichissement
-- de token (connectedMusicLibrary.ts), pas dans une Edge Function Deno separee.
-- pg_net peut appeler n'importe quelle URL HTTPS, pas seulement les Edge
-- Functions Supabase -- meme mecanisme que keep-push-worker, cible differente.
select cron.unschedule(jobid) from cron.job where jobname='keep-favorites-sync-every-30-minutes';
select cron.schedule(
  'keep-favorites-sync-every-30-minutes',
  '*/30 * * * *',
  $cron$
    select net.http_post(
      url:='https://keep-backend-mu.vercel.app/api/music/library/sync-favorites-worker',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-keep-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='keep_favorites_sync_worker_key' limit 1)
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=25000
    ) as request_id;
  $cron$
);
