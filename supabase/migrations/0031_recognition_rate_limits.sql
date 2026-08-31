-- KEEP — 0031: limite serveur de reconnaissance musicale.
-- Les invités n'ont volontairement pas de compte Supabase. La fonction Edge
-- keep-music-core calcule donc un hash opaque (IP + identifiant local) et
-- utilise cette table strictement interne pour empêcher une boucle de requêtes
-- de consommer le quota du fournisseur de reconnaissance.

create table if not exists public.recognition_rate_limits (
  identity_hash text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table public.recognition_rate_limits enable row level security;

-- Aucun accès direct depuis l'application. Le service role de la fonction Edge
-- contourne RLS. Cette policy explicite évite toute exposition accidentelle.
drop policy if exists recognition_rate_limits_none on public.recognition_rate_limits;
create policy recognition_rate_limits_none on public.recognition_rate_limits
  for all using (false) with check (false);

create or replace function public.service_allow_recognition(
  p_identity_hash text,
  p_limit integer default 10,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_window_start timestamptz;
  v_now timestamptz := now();
begin
  if p_identity_hash is null or length(btrim(p_identity_hash)) < 16 then
    return false;
  end if;
  if p_limit < 1 or p_limit > 120 or p_window_seconds < 10 or p_window_seconds > 3600 then
    return false;
  end if;

  insert into public.recognition_rate_limits(identity_hash, window_start, attempts, updated_at)
  values (p_identity_hash, v_now, 1, v_now)
  on conflict (identity_hash) do update set
    attempts = case
      when public.recognition_rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds) then 1
      else public.recognition_rate_limits.attempts + 1
    end,
    window_start = case
      when public.recognition_rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds) then v_now
      else public.recognition_rate_limits.window_start
    end,
    updated_at = v_now
  returning attempts, window_start into v_attempts, v_window_start;

  return v_attempts <= p_limit;
end;
$$;

create index if not exists idx_recognition_rate_limits_updated_at
  on public.recognition_rate_limits(updated_at);
