-- Adel teste énormément aujourd'hui (multi-invite, podium, etc.) et vient de
-- se faire bloquer par le cap anti-spam qu'on vient de livrer (20/j). On
-- relève la valeur par défaut à 60/j : ça reste largement suffisant pour
-- bloquer un vrai spammeur, mais ça ne coupe plus les phases de test réel.
update public.remote_config set value='60'::jsonb where key='battle_invites_per_day';
