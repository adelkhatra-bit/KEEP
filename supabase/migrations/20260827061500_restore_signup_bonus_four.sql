-- KEEP — règle produit validée : 3 crédits en essai + 4 supplémentaires
-- après création du compte, soit 7 au total avant toute formule payante.
-- Cette migration corrige une ancienne expérimentation à +20 sans toucher à
-- l'historique de consommation déjà enregistré.

update public.remote_config
set value = '4'::jsonb,
    description = 'Morceaux reconnus supplémentaires débloqués après inscription (total = guest_success_limit + ceci, jamais additionné deux fois).',
    updated_at = now()
where key = 'signup_bonus_successes';
