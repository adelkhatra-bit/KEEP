-- Keep a single paid-KEEP transaction path: keep_commit_paid_decision().
drop function if exists public.keep_record_paid_decision(uuid,text,jsonb,text,uuid);
