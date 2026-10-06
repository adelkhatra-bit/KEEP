-- Lot n°9.1 (05/10/2026) : Premium = 4,99 €/mois (docs/PRICING_STRATEGY.md),
-- au lieu du prix de lancement 2,99 € (migration 0030).
-- Ne touche que la ligne de prix affichée/réglable ; le montant réellement
-- débité reste celui du produit App Store Connect (affiché par StoreKit).
-- Les prix restent réglables dans le Super Admin. Aucun abonnement existant
-- n'est modifié.

update public.plan_prices pp
set amount = 4.99
from public.plans p
where pp.plan_id = p.id
  and p.code = 'PREMIUM'
  and pp.currency_code = 'EUR'
  and pp.period = 'MONTHLY'
  and pp.is_active = true
  and pp.amount is distinct from 4.99;
