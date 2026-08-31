-- Lookup en masse des empreintes via RPC (POST + corps JSON) plutôt qu'un
-- filtre PostgREST .in() classique : avec plusieurs milliers de valeurs de
-- hash à chercher pour un seul échantillon, .in() construit une URL GET de
-- dizaines de milliers de caractères qui échoue silencieusement côté client
-- Deno ("TypeError: error sending request", confirmé en production le
-- 31/08/2026 -- la vraie cause du "no_candidates" systématique malgré des
-- empreintes correctement stockées). Le corps de requête RPC n'a pas cette
-- limite de taille.
create or replace function service_lookup_fingerprint_hashes(p_hashes bigint[])
returns table(hash bigint, track_id uuid, time_offset_ms integer)
language sql
security definer
set search_path = public
as $$
  select hash, track_id, time_offset_ms
  from keep_fingerprint_hashes
  where hash = any(p_hashes);
$$;
