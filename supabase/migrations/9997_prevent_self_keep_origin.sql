alter table public.keep_decisions
  add constraint keep_decisions_no_self_source
  check (source_user_id is null or source_user_id <> profile_id) not valid;

alter table public.keep_decisions
  validate constraint keep_decisions_no_self_source;
