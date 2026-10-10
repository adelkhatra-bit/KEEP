-- Suppression des copies sémantiques depuis une notification choisie.
-- La suppression reste côté serveur, strictement limitée à auth.uid() et
-- à une fenêtre de 30 minutes autour de la notification conservée.
create or replace function public.keep_notification_remove_semantic_duplicates(p_keep_id uuid)
returns integer
language plpgsql
security definer
set search_path='public','auth'
as $$
declare
  uid uuid:=auth.uid();
  keep_row public.notifications%rowtype;
  keep_key text;
  removed integer:=0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into keep_row from public.notifications where id=p_keep_id and profile_id=uid;
  if keep_row.id is null then return 0; end if;
  keep_key:=public.keep_notification_semantic_key(keep_row.type,keep_row.data,keep_row.title,keep_row.body);
  delete from public.notifications n
  where n.profile_id=uid
    and n.id<>keep_row.id
    and n.type=keep_row.type
    and abs(extract(epoch from (n.created_at-keep_row.created_at)))<=1800
    and public.keep_notification_semantic_key(n.type,n.data,n.title,n.body)=keep_key;
  get diagnostics removed=row_count;
  return removed;
end;
$$;
revoke all on function public.keep_notification_remove_semantic_duplicates(uuid) from public, anon;
grant execute on function public.keep_notification_remove_semantic_duplicates(uuid) to authenticated;
