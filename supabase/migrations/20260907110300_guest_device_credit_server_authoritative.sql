-- Audit multi-agent 07/09/2026 (juge securite) : l'essai gratuit invite (3
-- credits) est stocke UNIQUEMENT en AsyncStorage cote appareil tant que
-- l'utilisateur reste en mode invite -- aucun appel serveur pour consommer ou
-- verifier ce compteur, donc effacer les donnees de l'app le reinitialise a
-- l'infini. Rend le compteur autoritaire cote serveur, cle par un identifiant
-- d'appareil (meme mecanisme deja utilise par keep-music-memory pour le
-- rate-limit de reconnaissance) plutot que par un compte -- le mode invite n'a
-- justement pas de compte. Ne resout pas le cas extreme d'un appareil
-- entierement reinitialise/desinstalle, mais ferme le cas reel signale
-- ("effacer les donnees de l'app") et empeche un client de mentir sur sa
-- consommation lors de la conversion en compte reel.

CREATE TABLE IF NOT EXISTS public.keep_guest_device_credit_usage (
  device_id text PRIMARY KEY,
  consumed_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.keep_guest_device_credit_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.keep_guest_device_credit_status(p_device_id text)
 RETURNS TABLE(consumed integer, credit_limit integer, remaining integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  lim integer := coalesce((select (value #>> '{}')::integer from public.remote_config where key = 'guest_success_limit' limit 1), 3);
  used integer := 0;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    return query select 0, lim, lim;
    return;
  end if;
  select consumed_count into used from public.keep_guest_device_credit_usage where device_id = trim(p_device_id);
  used := coalesce(used, 0);
  return query select used, lim, greatest(lim - used, 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.keep_guest_device_credit_consume(p_device_id text, p_amount integer DEFAULT 1)
 RETURNS TABLE(consumed integer, credit_limit integer, remaining integer, allowed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  lim integer := coalesce((select (value #>> '{}')::integer from public.remote_config where key = 'guest_success_limit' limit 1), 3);
  amount integer := greatest(1, coalesce(p_amount, 1));
  used integer := 0;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    return query select 0, lim, lim, false;
    return;
  end if;
  insert into public.keep_guest_device_credit_usage (device_id, consumed_count, updated_at)
  values (trim(p_device_id), 0, now())
  on conflict (device_id) do nothing;

  select consumed_count into used from public.keep_guest_device_credit_usage where device_id = trim(p_device_id) for update;
  if used >= lim then
    return query select used, lim, 0, false;
    return;
  end if;
  used := least(used + amount, lim);
  update public.keep_guest_device_credit_usage set consumed_count = used, updated_at = now() where device_id = trim(p_device_id);
  return query select used, lim, greatest(lim - used, 0), true;
end;
$function$;

-- Appelees par des invites sans compte : anon uniquement, jamais authenticated
-- (une fois connecte, le vrai chemin est keep_import_guest_credit_usage puis
-- keep_consume_download_credit).
REVOKE ALL ON FUNCTION public.keep_guest_device_credit_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.keep_guest_device_credit_consume(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_guest_device_credit_status(text) TO anon;
GRANT EXECUTE ON FUNCTION public.keep_guest_device_credit_consume(text, integer) TO anon;
