-- KEEP / Loki Music — catalogue Battle auto-expansif sans secret GitHub.
create table if not exists public.keep_battle_catalog_seed_state (
  theme_code text primary key references public.keep_battle_themes(code) on delete cascade,
  next_batch integer not null default 0 check (next_batch >= 0),
  total_batches integer not null check (total_batches > 0),
  priority integer not null default 100,
  last_request_id bigint,
  updated_at timestamptz not null default now()
);
alter table public.keep_battle_catalog_seed_state enable row level security;
revoke all on public.keep_battle_catalog_seed_state from anon, authenticated;

insert into public.keep_battle_catalog_seed_state(theme_code,total_batches,priority) values
  ('CHANSON_FR',33,1),('RAP_FR',12,2),('POP',2,10),('ROCK',2,11),
  ('FUNK',1,20),('DISCO',1,21),('AFRO',1,22),('RAP_US',1,23),
  ('ELECTRO',1,24),('RNB',1,25),('LATINO',1,26),('SOUL',1,27),
  ('REGGAE',1,28),('JAZZ',1,29),('CLASSIQUE',1,30),
  ('ANNEES_80',1,31),('ANNEES_90',1,32),
  ('RAI',1,40),('ARABE',1,41),('BRESIL',1,42),('INDE',1,43),
  ('KPOP',1,44),('TURC',1,45),('RUSSE',1,46)
on conflict(theme_code) do update set total_batches=excluded.total_batches,priority=excluded.priority;

do $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='keep_battle_catalog_cron_key' limit 1;
  if nullif(v_secret,'') is null then
    v_secret := encode(gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'keep_battle_catalog_cron_key','Loki Battle catalog cron key');
  end if;
  insert into public.keep_internal_worker_secrets(name,secret_hash)
  values ('battle-catalog-cron',encode(digest(v_secret,'sha256'),'hex'))
  on conflict(name) do update set secret_hash=excluded.secret_hash;
end $$;

create or replace function public.keep_enqueue_battle_catalog_seed_batch()
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_state public.keep_battle_catalog_seed_state%rowtype;
  v_secret text;
  v_request_id bigint;
begin
  select * into v_state from public.keep_battle_catalog_seed_state
  where next_batch < total_batches
  order by priority,updated_at,theme_code
  limit 1 for update skip locked;
  if v_state.theme_code is null then return null; end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name='keep_battle_catalog_cron_key' limit 1;
  if nullif(v_secret,'') is null then raise exception 'BATTLE_CATALOG_CRON_SECRET_MISSING'; end if;

  select net.http_get(
    url := 'https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-battle-catalog-seed',
    params := jsonb_build_object('theme',v_state.theme_code,'batch',v_state.next_batch),
    headers := jsonb_build_object('x-keep-cron-key',v_secret),
    timeout_milliseconds := 55000
  ) into v_request_id;

  update public.keep_battle_catalog_seed_state
  set next_batch=next_batch+1,last_request_id=v_request_id,updated_at=now()
  where theme_code=v_state.theme_code;
  return v_request_id;
end;
$$;
revoke all on function public.keep_enqueue_battle_catalog_seed_batch() from public,anon,authenticated;

select cron.schedule('keep-battle-catalog-expand-every-minute','* * * * *','select public.keep_enqueue_battle_catalog_seed_batch();');
select cron.schedule('keep-battle-catalog-expand-weekly-reset','5 3 * * 1',$$update public.keep_battle_catalog_seed_state set next_batch=0,updated_at=now();$$);
