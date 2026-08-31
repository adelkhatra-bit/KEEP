insert into public.feature_flags(key,description,is_enabled_globally,rollout_percent)
values ('keep_battle','KEEP BATTLE — duels de prédiction KEEP/PASS basés sur le goût musical réel',false,0)
on conflict (key) do update set description=excluded.description, updated_at=now();
