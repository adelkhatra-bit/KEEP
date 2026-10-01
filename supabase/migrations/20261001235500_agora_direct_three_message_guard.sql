-- Anti-harassment guard for direct Loki chat conversations.
-- A sender may send at most 3 consecutive direct messages until the recipient replies.
-- Public room messages are unaffected.

create or replace function public.keep_agora_direct_three_message_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_reply_id bigint := 0;
  v_unanswered_count integer := 0;
  v_pair_key text;
begin
  if new.target_profile_id is null
     or new.profile_id is null
     or new.target_profile_id = new.profile_id then
    return new;
  end if;

  -- Serialize the pair so concurrent taps cannot bypass the limit.
  v_pair_key :=
    least(new.profile_id::text, new.target_profile_id::text)
    || ':' ||
    greatest(new.profile_id::text, new.target_profile_id::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  select coalesce(max(m.id), 0)
    into v_last_reply_id
  from public.music_agora_messages m
  where m.profile_id = new.target_profile_id
    and m.target_profile_id = new.profile_id
    and m.moderation_status = 'VISIBLE';

  select count(*)::integer
    into v_unanswered_count
  from public.music_agora_messages m
  where m.profile_id = new.profile_id
    and m.target_profile_id = new.target_profile_id
    and m.id > v_last_reply_id
    and m.moderation_status = 'VISIBLE';

  if v_unanswered_count >= 3 then
    raise exception 'direct_message_reply_wait_required'
      using errcode = 'P0001',
            hint = 'Patiente que cette personne réponde avant d’envoyer un nouveau message.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_keep_agora_direct_three_message_guard
  on public.music_agora_messages;

create trigger trg_keep_agora_direct_three_message_guard
before insert on public.music_agora_messages
for each row
execute function public.keep_agora_direct_three_message_guard();
