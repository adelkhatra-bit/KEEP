-- Adel (20/09/2026) : "monte un petit service securise cote equipe avec une
-- API simple" -- relais de messages entre ChatGPT (instructions) et Claude
-- Code (rapports), sans jamais faire transiter Adel manuellement et sans
-- aucun secret en clair dans Git. Voir AI/AI_bridge.md pour le mode d'emploi
-- complet et supabase/functions/keep-ai-relay pour le point d'entree HTTP.
-- La cle qui authentifie ChatGPT (AI_RELAY_API_KEY) est stockee dans le
-- meme vault que tous les autres secrets KEEP (integration_secrets) et
-- n'est jamais lue ni ecrite par une IA -- seul Adel la colle dans
-- Super Admin, exactement comme Stripe/Brevo/Paddle.

create table if not exists public.ai_relay_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('instruction', 'report')),
  author text not null check (btrim(author) <> ''),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists ai_relay_messages_channel_created_idx
  on public.ai_relay_messages (channel, created_at desc);

alter table public.ai_relay_messages enable row level security;
-- Intentionnellement aucune policy : anon/authenticated n'ont aucun accès
-- direct à la table. Tout passe par les fonctions service_role ci-dessous
-- (appelées par keep-ai-relay avec la service role key, ou directement par
-- Claude via l'API Management Supabase déjà utilisée pour les migrations).

create or replace function public.service_ai_relay_post(
  p_channel text,
  p_author text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_channel not in ('instruction', 'report') then
    raise exception 'invalid_channel';
  end if;
  if p_author is null or btrim(p_author) = '' or p_body is null or btrim(p_body) = '' then
    raise exception 'author_and_body_required';
  end if;

  insert into public.ai_relay_messages(channel, author, body)
  values (p_channel, btrim(p_author), p_body)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.service_ai_relay_list(
  p_channel text,
  p_limit integer default 20
)
returns setof public.ai_relay_messages
language sql
security definer
set search_path = ''
stable
as $$
  select *
  from public.ai_relay_messages
  where channel = p_channel
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 200));
$$;

create or replace function public.service_ai_relay_mark_read(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_relay_messages
  set read_at = now()
  where id = p_id and read_at is null;
$$;

do $$
declare
  fn text;
  role_name text;
  functions text[] := array[
    'public.service_ai_relay_post(text,text,text)',
    'public.service_ai_relay_list(text,integer)',
    'public.service_ai_relay_mark_read(uuid)'
  ];
begin
  foreach fn in array functions loop
    execute format('revoke all on function %s from public', fn);
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on function %s from %I', fn, role_name);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end;
$$;
