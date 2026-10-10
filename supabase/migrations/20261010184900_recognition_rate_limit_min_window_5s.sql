-- 10/10/2026 (décision Adel) : fenêtre minimale 5 s pour service_allow_recognition
-- (keep-music-fallback passe à 1 essai ACRCloud / 8 s). Déjà appliquée en production.
CREATE OR REPLACE FUNCTION public.service_allow_recognition(p_identity_hash text, p_limit integer DEFAULT 10, p_window_seconds integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_attempts integer;
  v_window_start timestamptz;
  v_now timestamptz := now();
begin
  if p_identity_hash is null or length(btrim(p_identity_hash)) < 16 then
    return false;
  end if;
  if p_limit < 1 or p_limit > 120 or p_window_seconds < 5 or p_window_seconds > 3600 then
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
$function$;
