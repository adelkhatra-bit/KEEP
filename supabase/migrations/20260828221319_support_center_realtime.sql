do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin alter publication supabase_realtime add table public.support_tickets; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.support_ticket_messages; exception when duplicate_object then null; end;
  end if;
end $$;
