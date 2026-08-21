-- KEEP — 0007: Données de référence (pays/devises/plans initiaux)
-- Grille de prix initiale proposée — voir docs/PRICING_STRATEGY.md pour les
-- sources et la méthodologie. 100% modifiable ensuite depuis le Super Admin
-- (ces valeurs ne sont PAS codées en dur côté application, uniquement ici en
-- donnée de démarrage).

insert into currencies (code, symbol, decimal_digits) values
  ('EUR', '€', 2), ('USD', '$', 2), ('GBP', '£', 2), ('AED', 'د.إ', 2)
on conflict (code) do nothing;

insert into countries (code, name, default_currency_code, is_available) values
  ('FR', 'France', 'EUR', true),
  ('BE', 'Belgique', 'EUR', true),
  ('US', 'United States', 'USD', true),
  ('GB', 'United Kingdom', 'GBP', true),
  ('AE', 'United Arab Emirates', 'AED', false)
on conflict (code) do nothing;

insert into features (code, name, description) values
  ('recognition', 'Reconnaissance musicale', 'Identifier une musique en cours'),
  ('smart_router', 'SmartPlaylistRouter', 'Recommandation de playlist apprise'),
  ('compare_keep', 'Compare nos KEEP', 'Comparer deux bibliothèques musicales'),
  ('take_sounds', 'Prendre ses sons', 'Récupérer des morceaux depuis un autre profil'),
  ('multi_provider', 'Multi-providers', 'Connecter plusieurs plateformes musicales'),
  ('events', 'Événements', 'Créer et gérer des événements'),
  ('creator_analytics', 'Analytics Creator', 'Statistiques avancées pour créateurs/DJ'),
  ('venue_tools', 'Outils Venue', 'QR codes, gestion de lieu, promotion locale'),
  ('local_discovery', 'Découverte locale', 'Recommandations basées sur la localisation approximative')
on conflict (code) do nothing;

insert into plans (code, name, description, trial_days) values
  ('FREE', 'Free', 'Assez utile pour comprendre la valeur de KEEP et devenir viral.', 0),
  ('PREMIUM', 'Premium', 'Rangement illimité, historique complet, plusieurs providers.', 7),
  ('CREATOR_PRO', 'Creator Pro', 'Pour DJ, artistes et créateurs : analytics, événements, promotion.', 14),
  ('VENUE_PRO', 'Venue Pro', 'Pour clubs, bars, hôtels : événements, QR, analytics de fréquentation.', 14)
on conflict (code) do nothing;

-- Prix EUR (marché de lancement) — mensuel/annuel. USD/GBP/AED à ajouter
-- depuis le Super Admin lors de l'ouverture de chaque pays (§48).
insert into plan_prices (plan_id, currency_code, period, amount)
select p.id, 'EUR', 'MONTHLY', v.amount from plans p
join (values ('FREE', 0.00), ('PREMIUM', 4.99), ('CREATOR_PRO', 9.99), ('VENUE_PRO', 29.00)) as v(code, amount)
  on v.code = p.code::text;

insert into plan_prices (plan_id, currency_code, period, amount)
select p.id, 'EUR', 'YEARLY', v.amount from plans p
join (values ('FREE', 0.00), ('PREMIUM', 39.99), ('CREATOR_PRO', 79.00), ('VENUE_PRO', 279.00)) as v(code, amount)
  on v.code = p.code::text;

-- Entitlements par plan
insert into plan_entitlements (plan_id, feature_id, is_enabled)
select p.id, f.id, true from plans p, features f
where p.code = 'FREE' and f.code in ('recognition', 'smart_router');

insert into plan_entitlements (plan_id, feature_id, is_enabled)
select p.id, f.id, true from plans p, features f
where p.code = 'PREMIUM' and f.code in ('recognition', 'smart_router', 'compare_keep', 'take_sounds', 'multi_provider');

insert into plan_entitlements (plan_id, feature_id, is_enabled)
select p.id, f.id, true from plans p, features f
where p.code = 'CREATOR_PRO' and f.code in ('recognition', 'smart_router', 'compare_keep', 'take_sounds', 'multi_provider', 'events', 'creator_analytics');

insert into plan_entitlements (plan_id, feature_id, is_enabled)
select p.id, f.id, true from plans p, features f
where p.code = 'VENUE_PRO' and f.code in ('recognition', 'smart_router', 'compare_keep', 'take_sounds', 'multi_provider', 'events', 'creator_analytics', 'venue_tools', 'local_discovery');

-- Quotas — volontairement généreux en FREE pour la viralité (cf. §39), mais
-- bornés pour maîtriser le coût de reconnaissance (~5$/1000 requêtes AudD).
insert into usage_limits (plan_id, limit_key, limit_value)
select p.id, v.limit_key, v.limit_value from plans p
join (values ('keeps_per_month', 150), ('follows_max', 100), ('compares_per_month', 3), ('providers_max', 1))
  as v(limit_key, limit_value) on true
where p.code = 'FREE';

insert into usage_limits (plan_id, limit_key, limit_value)
select p.id, v.limit_key, v.limit_value from plans p
join (values ('keeps_per_month', null), ('follows_max', null), ('compares_per_month', null), ('providers_max', 3))
  as v(limit_key, limit_value) on true
where p.code = 'PREMIUM';

insert into usage_limits (plan_id, limit_key, limit_value)
select p.id, v.limit_key, v.limit_value from plans p
join (values ('keeps_per_month', null), ('follows_max', null), ('compares_per_month', null), ('providers_max', 3), ('events_max', 10))
  as v(limit_key, limit_value) on true
where p.code = 'CREATOR_PRO';

insert into usage_limits (plan_id, limit_key, limit_value)
select p.id, v.limit_key, v.limit_value from plans p
join (values ('keeps_per_month', null), ('follows_max', null), ('compares_per_month', null), ('providers_max', 3), ('events_max', null))
  as v(limit_key, limit_value) on true
where p.code = 'VENUE_PRO';

-- Pondération par défaut du SmartPlaylistRouter (correspond à DEFAULT_ROUTER_WEIGHTS
-- dans packages/music/src/SmartPlaylistRouter.ts — garder synchronisé).
insert into router_config_versions (version, config, is_active) values (
  1,
  '{"nameKeywordMatch":0.35,"descriptionKeywordMatch":0.15,"learnedArtistWeight":0.35,"learnedGenreWeight":0.15,"correctionBoost":3,"acceptBoost":1}'::jsonb,
  true
);

insert into feature_flags (key, description, is_enabled_globally) values
  ('compare_keep', 'Compare nos KEEP', true),
  ('events', 'Événements', true),
  ('local_discovery', 'Découverte locale', false),
  ('creator', 'Profils Creator', true),
  ('venue', 'Profils Venue', true),
  ('keep_dna', 'KEEP DNA — ADN musical (voir docs/INNOVATIONS.md)', false)
on conflict (key) do nothing;
