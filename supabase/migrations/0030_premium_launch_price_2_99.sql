-- KEEP — 0030: prix de lancement Premium
-- Source de vérité fonctionnelle : Premium = 2,99 EUR / mois.
-- Cette migration corrige les environnements initialisés avec l'ancien seed
-- sans modifier l'historique des migrations déjà appliquées.

update plan_prices pp
set amount = 2.99
from plans p
where pp.plan_id = p.id
  and p.code = 'PREMIUM'
  and pp.currency_code = 'EUR'
  and pp.period = 'MONTHLY'
  and pp.is_active = true
  and pp.amount is distinct from 2.99;
