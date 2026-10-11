do $$
declare
  v_jobid bigint;
  v_command text;
begin
  select jobid, command
  into v_jobid, v_command
  from cron.job
  where jobname='keep-battle-sparse-catalog-seed'
  limit 1;

  if v_jobid is null then
    raise exception 'keep-battle-sparse-catalog-seed cron missing';
  end if;
  if position('timeout_milliseconds := 25000' in v_command)=0 then
    raise exception 'Expected 25s sparse catalog timeout not found';
  end if;

  perform cron.alter_job(
    job_id := v_jobid,
    command := replace(v_command, 'timeout_milliseconds := 25000', 'timeout_milliseconds := 55000')
  );
end
$$;
