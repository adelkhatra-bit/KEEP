-- Défense de marque côté base : les textes visibles de notification
-- utilisent Loki/Loki Music même si une ancienne fonction serveur envoie
-- encore un ancien libellé. Les types, clés JSON et identifiants keep_* ne
-- sont jamais modifiés.

create or replace function public.normalize_loki_notification_visible_copy()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.title is not null then
    new.title := replace(replace(new.title, 'KEEP Music', 'Loki Music'), 'KEEP', 'Loki');
  end if;
  if new.body is not null then
    new.body := replace(
      replace(
        replace(new.body, 'l’équipe Loki Music', 'Loki Music'),
        'l''équipe Loki Music', 'Loki Music'
      ),
      'KEEP Music', 'Loki Music'
    );
    new.body := replace(new.body, 'KEEP', 'Loki');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_loki_notification_visible_copy on public.notifications;
create trigger trg_normalize_loki_notification_visible_copy
before insert or update of title, body on public.notifications
for each row execute function public.normalize_loki_notification_visible_copy();

update public.notifications
set title = title, body = body
where upper(coalesce(title,'')) like '%KEEP%'
   or upper(coalesce(body,'')) like '%KEEP%'
   or lower(coalesce(body,'')) like '%équipe loki%';
