-- Product rule: listening stays free; GARDER a new recommendation costs 3 FREE.
update public.remote_config
set value='3'::jsonb
where key='free_cost_per_keep';

insert into public.remote_config(key,value)
select 'free_cost_per_keep','3'::jsonb
where not exists(select 1 from public.remote_config where key='free_cost_per_keep');
