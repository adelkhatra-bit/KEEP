-- AUDIT CRITIQUE (18/09/2026) : Nettoyage des notifications en doublon
-- Adel a signalé des notifications qui s'affichent deux fois sur la cloche.
-- Cause: plusieurs triggers coexistent sur les mêmes tables, créant plusieurs
-- notifications pour une seule action. Solution: un seul trigger par table,
-- l'autre supprimé. Format garanti: une notification = une ligne en base.

-- ===== FOLLOW NOTIFICATIONS =====
-- Anciens triggers/fonctions qui peuvent créer des doublons
drop trigger if exists trg_notify_on_follow on public.follows;
drop function if exists public.notify_on_follow();

drop trigger if exists trg_keep_notify_new_follower on public.follows;
drop function if exists public.keep_notify_new_follower();

-- Gardons seulement le plus récent qui gère insert ET delete
-- (nouvelles et perdre abonnés, sans doublons)
drop trigger if exists trg_keep_notify_follow_change on public.follows;
drop function if exists public.keep_notify_follow_change();

-- Crée la version finale unique et fiable
create or replace function public.keep_notify_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  target_id uuid;
  actor_username text;
  social_notifications_enabled boolean := true;
  notification_type text;
  notification_title text;
  notification_body text;
begin
  if tg_op = 'INSERT' then
    actor_id := new.follower_id;
    target_id := new.followee_id;
    notification_type := 'NEW_FOLLOWER';
    notification_title := 'Nouvel abonné';
  elsif tg_op = 'DELETE' then
    actor_id := old.follower_id;
    target_id := old.followee_id;
    notification_type := 'FOLLOWER_LEFT';
    notification_title := 'Désabonnement';
  else
    return coalesce(new, old);
  end if;

  select coalesce(np.social_enabled, true)
    into social_notifications_enabled
    from public.notification_preferences np
   where np.profile_id = target_id;
  if not found then
    social_notifications_enabled := true;
  end if;

  if social_notifications_enabled then
    select p.username into actor_username
      from public.profiles p
     where p.id = actor_id;

    if tg_op = 'INSERT' then
      notification_body := coalesce('@' || actor_username, 'Un utilisateur') || ' vient de s''abonner à ton profil KEEP.';
    else
      notification_body := coalesce('@' || actor_username, 'Un utilisateur') || ' ne suit plus ton profil KEEP.';
    end if;

    insert into public.notifications(profile_id, type, title, body, data)
    values (
      target_id,
      notification_type,
      notification_title,
      notification_body,
      jsonb_build_object(
        'actor_id', actor_id,
        'actor_username', actor_username,
        'followee_id', target_id
      )
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_notify_follow_change() from public, anon, authenticated;

-- Un seul trigger pour tous les cas (insert follow, delete follow)
create trigger trg_keep_notify_follow_change
after insert or delete on public.follows
for each row execute function public.keep_notify_follow_change();

-- Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
-- Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
