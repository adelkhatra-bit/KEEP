-- KEEP — 0018: applique la révision de prix du 24/08/2026 (docs/KEEP_DECISIONS.md)
-- aux VRAIES lignes plan_prices -- jusqu'ici seule la documentation avait été
-- corrigée, les lignes seedées par 0007 restaient à l'ancienne grille
-- (PREMIUM 4,99€, VENUE_PRO 29€) : trouvé en auditant sur demande explicite
-- d'Adel avant de construire le vrai système d'abonnement.

update plan_prices set amount = 2.99
  where plan_id = (select id from plans where code = 'PREMIUM') and period = 'MONTHLY';
update plan_prices set amount = 29.99
  where plan_id = (select id from plans where code = 'VENUE_PRO') and period = 'MONTHLY';
-- CREATOR_PRO mensuel (9,99€) était déjà correct, aucun changement nécessaire.

-- Annuel/essai non re-confirmés depuis la révision (cf. docs/PRICING_STRATEGY.md)
-- -- désactivés plutôt que laissés à afficher un chiffre non validé comme si
-- c'était une vraie décision produit.
update plan_prices set is_active = false where period = 'YEARLY';
