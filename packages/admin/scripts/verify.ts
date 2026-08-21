/**
 * Vérification exécutable réelle des agrégats Super Admin
 * (packages/admin/lib/aggregate.ts) — jamais un chiffre affiché dans une
 * page qui ne soit pas issu d'une de ces fonctions, elles-mêmes vérifiées
 * ici avec des données de test connues, plutôt qu'une simple relecture
 * visuelle des écrans (impossible sans Jest/DOM dans ce sandbox, voir
 * docs/PROJECT_STATUS.md).
 *
 * Usage: npx tsx packages/admin/scripts/verify.ts
 */
import {
  computeMRR,
  computeARR,
  computePayingUsers,
  computeConversionRate,
  computeTotalMonthlyCosts,
  computeEstimatedMargin,
  computeARPU,
  computeKeepsTotal,
  filterUsers,
} from '../lib/aggregate';
import { DEMO_USERS, DEMO_SUBSCRIPTIONS, DEMO_COSTS, DEMO_FEATURE_FLAGS } from '../lib/demoData';

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL ${label}`);
  }
}

function main() {
  console.log('== Agrégats Dashboard/Coûts/Plans ==');

  const mrr = computeMRR(DEMO_SUBSCRIPTIONS);
  check('MRR = somme des abonnements ACTIVE uniquement (pas TRIALING)', mrr === 4.99 + 9.99);

  check('ARR = MRR * 12', computeARR(DEMO_SUBSCRIPTIONS) === mrr * 12);

  const paying = computePayingUsers(DEMO_USERS);
  check('utilisateurs payants = tous sauf plan FREE', paying === DEMO_USERS.filter((u) => u.plan !== 'FREE').length);

  const conversion = computeConversionRate(DEMO_USERS);
  check('taux de conversion = payants / total', Math.abs(conversion - paying / DEMO_USERS.length) < 1e-9);

  const totalCosts = computeTotalMonthlyCosts(DEMO_COSTS);
  check('coûts totaux = somme de tous les postes', totalCosts === DEMO_COSTS.reduce((s, c) => s + c.monthlyAmountEur, 0));

  check('marge estimée = MRR - coûts', computeEstimatedMargin(DEMO_SUBSCRIPTIONS, DEMO_COSTS) === mrr - totalCosts);

  const arpu = computeARPU(DEMO_USERS, DEMO_SUBSCRIPTIONS);
  check('ARPU = MRR / nombre total d\'utilisateurs (pas seulement les payants)', Math.abs(arpu - mrr / DEMO_USERS.length) < 1e-9);

  check('total GARDER = somme de keepsThisMonth', computeKeepsTotal(DEMO_USERS) === DEMO_USERS.reduce((s, u) => s + u.keepsThisMonth, 0));

  console.log('== Utilisateurs (recherche + filtre) ==');
  check('sans filtre -> tous les utilisateurs', filterUsers(DEMO_USERS, '', 'ALL').length === DEMO_USERS.length);
  check('filtre par plan CREATOR_PRO -> exactement les CREATOR_PRO', filterUsers(DEMO_USERS, '', 'CREATOR_PRO').every((u) => u.plan === 'CREATOR_PRO'));
  check('recherche par pseudo (insensible à la casse)', filterUsers(DEMO_USERS, 'DJ_NOVA', 'ALL').some((u) => u.username === 'dj_nova'));
  check('recherche par pays', filterUsers(DEMO_USERS, 'be', 'ALL').every((u) => u.country === 'BE'));
  check('recherche + filtre plan combinés (AND, pas OR)', filterUsers(DEMO_USERS, 'fr', 'VENUE_PRO').length === DEMO_USERS.filter((u) => u.country.toLowerCase().includes('fr') && u.plan === 'VENUE_PRO').length);
  check('recherche sans résultat -> tableau vide (pas d\'erreur)', filterUsers(DEMO_USERS, 'zzz_inexistant', 'ALL').length === 0);

  console.log('== Feature flags (cohérence avec le seed SQL) ==');
  const expectedKeys = ['compare_keep', 'events', 'local_discovery', 'creator', 'venue', 'keep_dna'];
  check('mêmes clés que le seed supabase/migrations/0007_seed_defaults.sql', JSON.stringify(DEMO_FEATURE_FLAGS.map((f) => f.key).sort()) === JSON.stringify([...expectedKeys].sort()));
  const keepDna = DEMO_FEATURE_FLAGS.find((f) => f.key === 'keep_dna');
  check('keep_dna désactivé par défaut (comme en base -- jamais activé par défaut côté admin)', keepDna?.isEnabledGlobally === false);

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main();
