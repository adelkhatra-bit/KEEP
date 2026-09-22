-- Adel (20/09/2026) : garde-fou strict avant activation du relais --
-- anti-doublon, limite de taille et de fréquence sur service_ai_relay_post.
-- L'authentification (x-relay-key), le blocage des commandes shell (le
-- relais n'exécute jamais rien -- il stocke du texte que Claude relit
-- manuellement) et le "aucun secret dans Git" sont déjà garantis par
-- l'architecture existante (voir 20260920120000_keep_ai_relay.sql).

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
  v_author text := btrim(coalesce(p_author, ''));
  v_recent_count integer;
begin
  if p_channel not in ('instruction', 'report') then
    raise exception 'invalid_channel';
  end if;
  if v_author = '' or p_body is null or btrim(p_body) = '' then
    raise exception 'author_and_body_required';
  end if;
  if length(p_body) > 4000 then
    raise exception 'body_too_long';
  end if;

  -- Anti-doublon : un texte identique déjà déposé dans les 5 dernières
  -- minutes renvoie l'id existant au lieu de créer une nouvelle ligne.
  select id into v_id
  from public.ai_relay_messages
  where channel = p_channel
    and author = v_author
    and body = p_body
    and created_at > now() - interval '5 minutes'
  order by created_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Fréquence : max 30 messages/heure par (canal, auteur).
  select count(*) into v_recent_count
  from public.ai_relay_messages
  where channel = p_channel
    and author = v_author
    and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then
    raise exception 'rate_limited';
  end if;

  insert into public.ai_relay_messages(channel, author, body)
  values (p_channel, v_author, p_body)
  returning id into v_id;

  return v_id;
end;
$$;
