-- Les QR PayPal du Tchat utilisent un marqueur technique dans le message.
-- Ce marqueur ne doit jamais apparaître dans une notification utilisateur.

create or replace function public.keep_agora_notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sender text;
  v_body text;
  v_data jsonb;
  v_qr_url text;
begin
  if new.target_profile_id is null then return new; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=new.target_profile_id and coalesce(p.community_chat_notifications,true)
  ) then return new; end if;

  select username into v_sender from public.profiles where id=new.profile_id;

  if new.body like '[[KEEP_PAYPAL_QR]]%' then
    v_qr_url := nullif(trim(substr(new.body, length('[[KEEP_PAYPAL_QR]]') + 1)), '');
  end if;

  v_body := case
    when new.shared_track_id is not null
      then '@'||coalesce(v_sender,'membre')||' t’a partagé une musique dans le Tchat.'
    when v_qr_url is not null
      then 'QR PayPal partagé · ouvre le Tchat pour l’afficher.'
    else left(new.body,120)
  end;

  v_data := jsonb_build_object(
    'event','AGORA_DIRECT','roomSlug',new.room_slug,'messageId',new.id,
    'senderId',new.profile_id,'senderUsername',v_sender,'sharedTrackId',new.shared_track_id,
    'soundKind','social'
  );
  if v_qr_url is not null then
    v_data := v_data || jsonb_build_object('image_url',v_qr_url,'contentKind','PAYPAL_QR');
  end if;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values(
    new.target_profile_id,'AGORA_DIRECT',
    '@'||coalesce(v_sender,'membre')||' t’a écrit',
    v_body,
    v_data,
    'CREATED',0
  );

  insert into public.music_agora_direct_notification_deliveries(message_id,profile_id)
  values(new.id,new.target_profile_id)
  on conflict do nothing;
  return new;
end;
$function$;

-- Répare les notifications historiques sans toucher au message du Tchat.
update public.notifications
set
  data = coalesce(data,'{}'::jsonb) || jsonb_build_object(
    'image_url', trim(substr(body, length('[[KEEP_PAYPAL_QR]]') + 1)),
    'contentKind','PAYPAL_QR'
  ),
  body = 'QR PayPal partagé · ouvre le Tchat pour l’afficher.'
where type='AGORA_DIRECT'
  and body like '[[KEEP_PAYPAL_QR]]%';
