-- Adel (02/10/2026) : signal des messages non lus. Diagnostic (lecture) :
-- les notifications de groupe ont toujours le même texte (« @x a envoyé un
-- message. »). Le garde-fou anti-doublon (keep_notifications_skip_duplicate)
-- compare ce texte sur 30 minutes : le 2e message d'un même membre dans un
-- groupe en moins de 30 min NE CRÉAIT AUCUNE notification (ni compteur, ni
-- push). Idem en privé pour deux messages identiques (« ok », « ok »).
-- Correction : pour le tchat (types AGORA_*), la clé est l'identifiant du
-- message ; un vrai doublon (même message) reste bloqué.
-- Aucun index n'utilise cette fonction. Additif : aucune donnée modifiée.

create or replace function public.keep_notification_semantic_key(p_type text, p_data jsonb, p_title text, p_body text)
 returns text
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  t text := upper(coalesce(p_type,''));
  arena text;
  match_no text;
  stable_id text;
  actor_id text;
  message_id text;
begin
  arena := coalesce(p_data->>'arenaId',p_data->>'arena_id');
  match_no := coalesce(p_data->>'matchNo',p_data->>'match_no');

  if t in ('BATTLE_ARENA_WIN','BATTLE_ARENA_LOSS','BATTLE_ARENA_RESULT') and arena is not null then
    return t||'|arena:'||arena||'|match:'||coalesce(match_no,'');
  end if;
  if t in ('BATTLE_ARENA_REMATCH','BATTLE_REMATCH') and arena is not null then
    return t||'|arena:'||arena;
  end if;

  -- Tchat : un message = une notification (même texte ou non).
  message_id := coalesce(p_data->>'messageId',p_data->>'message_id');
  if t like 'AGORA%' and message_id is not null and message_id <> '' then
    return t||'|message:'||message_id||'|group:'||coalesce(p_data->>'groupId',p_data->>'group_id','');
  end if;

  stable_id := coalesce(
    p_data->>'paymentId',p_data->>'payment_id',
    p_data->>'challengeId',p_data->>'challenge_id',
    p_data->>'eventId',p_data->>'event_id',
    p_data->>'offerId',p_data->>'offer_id'
  );
  if stable_id is not null and stable_id <> '' then
    return t||'|entity:'||stable_id;
  end if;

  if coalesce(p_data->>'trackId',p_data->>'track_id') is not null then
    actor_id := coalesce(
      p_data->>'actorId',p_data->>'actor_id',
      p_data->>'profileId',p_data->>'profile_id',
      p_data->>'sellerId',p_data->>'seller_id',
      p_data->>'buyerId',p_data->>'buyer_id',
      ''
    );
    return t||'|track:'||coalesce(p_data->>'trackId',p_data->>'track_id')||'|actor:'||actor_id;
  end if;

  return t||'|text:'||
    lower(regexp_replace(coalesce(p_title,''),'\s+',' ','g'))||'|'||
    lower(regexp_replace(coalesce(p_body,''),'\s+',' ','g'));
end;
$function$;
