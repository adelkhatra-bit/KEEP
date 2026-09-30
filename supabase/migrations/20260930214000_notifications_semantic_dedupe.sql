-- Déduplication sémantique : les producteurs peuvent ajouter des champs
-- volatils différents à deux notifications du même événement. On compare
-- donc l'identifiant métier stable pendant 30 minutes.
create or replace function public.keep_notification_semantic_key(p_type text,p_data jsonb,p_title text,p_body text)
returns text language plpgsql immutable set search_path='public' as $$
declare t text:=upper(coalesce(p_type,'')); arena text; match_no text; stable_id text; actor_id text;
begin
  arena:=coalesce(p_data->>'arenaId',p_data->>'arena_id');
  match_no:=coalesce(p_data->>'matchNo',p_data->>'match_no');
  if t in ('BATTLE_ARENA_WIN','BATTLE_ARENA_LOSS','BATTLE_ARENA_RESULT') and arena is not null then
    return t||'|arena:'||arena||'|match:'||coalesce(match_no,'');
  end if;
  if t in ('BATTLE_ARENA_REMATCH','BATTLE_REMATCH') and arena is not null then return t||'|arena:'||arena; end if;
  stable_id:=coalesce(p_data->>'paymentId',p_data->>'payment_id',p_data->>'challengeId',p_data->>'challenge_id',p_data->>'eventId',p_data->>'event_id',p_data->>'offerId',p_data->>'offer_id');
  if stable_id is not null and stable_id<>'' then return t||'|entity:'||stable_id; end if;
  if coalesce(p_data->>'trackId',p_data->>'track_id') is not null then
    actor_id:=coalesce(p_data->>'actorId',p_data->>'actor_id',p_data->>'profileId',p_data->>'profile_id',p_data->>'sellerId',p_data->>'seller_id',p_data->>'buyerId',p_data->>'buyer_id','');
    return t||'|track:'||coalesce(p_data->>'trackId',p_data->>'track_id')||'|actor:'||actor_id;
  end if;
  return t||'|text:'||lower(regexp_replace(coalesce(p_title,''),'\s+',' ','g'))||'|'||lower(regexp_replace(coalesce(p_body,''),'\s+',' ','g'));
end $$;

create or replace function public.keep_notifications_skip_duplicate()
returns trigger language plpgsql security definer set search_path='public' as $$
declare new_key text;
begin
  new_key:=public.keep_notification_semantic_key(new.type,new.data,new.title,new.body);
  if exists (
    select 1 from public.notifications n
    where n.profile_id=new.profile_id and n.type=new.type
      and n.created_at>now()-interval '30 minutes'
      and public.keep_notification_semantic_key(n.type,n.data,n.title,n.body)=new_key
  ) then return null; end if;
  return new;
end $$;

drop trigger if exists keep_notifications_skip_duplicate on public.notifications;
create trigger keep_notifications_skip_duplicate before insert on public.notifications
for each row execute function public.keep_notifications_skip_duplicate();

revoke all on function public.keep_notification_semantic_key(text,jsonb,text,text) from anon;
grant execute on function public.keep_notification_semantic_key(text,jsonb,text,text) to authenticated;
