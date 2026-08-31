/**
 * Données DEMO du Super Admin — reflètent la structure réelle de
 * `supabase/migrations/` mais ne sont PAS lues depuis un vrai projet
 * Supabase (aucun n'est encore connecté, voir docs/PROJECT_STATUS.md).
 *
 * Règle "aucun faux résultat" : tous les agrégats affichés dans l'UI sont
 * CALCULÉS à partir de ces tableaux (voir lib/aggregate.ts), jamais des
 * nombres inventés écrits directement dans un composant.
 */

export type PlanCode = 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';

export interface DemoSubscription {
  id: string;
  plan: PlanCode;
  status: 'TRIALING' | 'ACTIVE' | 'CANCELLED';
  monthlyAmountEur: number;
  countryCode: string;
  createdAt: string;
}

export interface DemoUser {
  id: string;
  username: string;
  country: string;
  plan: PlanCode;
  keepsThisMonth: number;
  joinedAt: string;
}

export interface DemoCost {
  category: 'supabase' | 'music_recognition' | 'hosting' | 'email' | 'push' | 'other';
  label: string;
  monthlyAmountEur: number;
}

export interface DemoFeatureFlag {
  key: string;
  description: string;
  isEnabledGlobally: boolean;
}

/**
 * Doit rester IDENTIQUE (clés + valeurs par défaut) au seed réel
 * `supabase/migrations/0007_seed_defaults.sql` (`insert into feature_flags`)
 * -- toute divergence ici serait une source de confusion "l'admin affiche
 * un flag qui n'existe pas en base, ou avec une valeur par défaut fausse".
 * `keep_dna` reste désactivé par défaut ici comme en base (voir
 * docs/INNOVATIONS.md pour le contexte produit) -- ne jamais l'activer par
 * défaut dans l'UI sans que ce soit aussi le cas en base.
 */
export const DEMO_FEATURE_FLAGS: DemoFeatureFlag[] = [
  { key: 'compare_keep', description: 'Compare nos morceaux', isEnabledGlobally: true },
  { key: 'events', description: 'Événements', isEnabledGlobally: true },
  { key: 'local_discovery', description: 'Découverte locale', isEnabledGlobally: false },
  { key: 'creator', description: 'Profils Creator', isEnabledGlobally: true },
  { key: 'venue', description: 'Profils Venue', isEnabledGlobally: true },
  { key: 'keep_dna', description: 'Loki DNA — ADN musical (voir docs/INNOVATIONS.md)', isEnabledGlobally: false },
];

export interface DemoAppSetting {
  key: string;
  description: string;
  value: number;
  unit: string;
}

/**
 * Réglages numériques (pas des on/off, donc séparés de `feature_flags`).
 * `session_silence_timeout_minutes` pilote `useSessionStore` côté mobile
 * (constante `DEFAULT_SESSION_SILENCE_TIMEOUT_MIN`) — corrections concept
 * du 21/08/2026 ("cette durée doit être modifiable depuis le Super Admin").
 * STATUT HONNÊTE : contrairement à `DEMO_FEATURE_FLAGS`, cette valeur n'a
 * PAS encore de table `app_settings` en base (aucun projet Supabase Loki
 * déployé, voir docs/PROJECT_STATUS.md) — modifier ce réglage ici reste
 * Mode Démo pur, ça ne change rien côté mobile tant que la livraison
 * admin -> mobile n'est pas câblée. Ne pas prétendre le contraire.
 */
export const DEMO_APP_SETTINGS: DemoAppSetting[] = [
  {
    key: 'session_silence_timeout_minutes',
    description: 'Fin de session proposée après une absence de musique de',
    value: 10,
    unit: 'minutes',
  },
];

export const DEMO_USERS: DemoUser[] = [
  { id: 'u1', username: 'adel', country: 'FR', plan: 'PREMIUM', keepsThisMonth: 42, joinedAt: '2026-06-01' },
  { id: 'u2', username: 'lea_m', country: 'FR', plan: 'FREE', keepsThisMonth: 12, joinedAt: '2026-07-10' },
  { id: 'u3', username: 'dj_nova', country: 'FR', plan: 'CREATOR_PRO', keepsThisMonth: 87, joinedAt: '2026-05-15' },
  { id: 'u4', username: 'club_lumen', country: 'FR', plan: 'VENUE_PRO', keepsThisMonth: 5, joinedAt: '2026-04-20' },
  { id: 'u5', username: 'sam_k', country: 'BE', plan: 'FREE', keepsThisMonth: 3, joinedAt: '2026-08-02' },
];

export const DEMO_SUBSCRIPTIONS: DemoSubscription[] = [
  { id: 's1', plan: 'PREMIUM', status: 'ACTIVE', monthlyAmountEur: 4.99, countryCode: 'FR', createdAt: '2026-06-01' },
  { id: 's2', plan: 'CREATOR_PRO', status: 'ACTIVE', monthlyAmountEur: 9.99, countryCode: 'FR', createdAt: '2026-05-15' },
  { id: 's3', plan: 'VENUE_PRO', status: 'TRIALING', monthlyAmountEur: 29.0, countryCode: 'FR', createdAt: '2026-08-10' },
];

export const DEMO_COSTS: DemoCost[] = [
  { category: 'supabase', label: 'Supabase (Pro)', monthlyAmountEur: 25 },
  { category: 'music_recognition', label: 'AudD (pay-as-you-go)', monthlyAmountEur: 18 },
  { category: 'hosting', label: 'Hosting web public + admin', monthlyAmountEur: 12 },
  { category: 'push', label: 'Notifications push', monthlyAmountEur: 0 },
  { category: 'email', label: 'Emails transactionnels', monthlyAmountEur: 0 },
];
