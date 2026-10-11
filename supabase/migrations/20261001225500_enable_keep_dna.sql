update public.feature_flags
set is_enabled_globally = true,
    updated_at = now()
where key = 'keep_dna';
