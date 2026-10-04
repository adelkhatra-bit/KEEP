do $$
declare
  v_def text;
  v_occurrences integer;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='keep_process_public_track_notification_fanout'
  limit 1;

  if v_def is null then
    raise exception 'keep_process_public_track_notification_fanout missing';
  end if;

  v_occurrences :=
    (length(v_def) - length(replace(v_def, 'interval ''30 minutes''', '')))
    / length('interval ''30 minutes''');

  if v_occurrences <> 1 then
    raise exception 'Expected exactly one 30-minute public-music cooldown, found %', v_occurrences;
  end if;

  execute replace(v_def, 'interval ''30 minutes''', 'interval ''6 hours''');
end
$$;
