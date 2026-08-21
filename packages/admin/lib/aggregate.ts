import { DemoCost, DemoSubscription, DemoUser, PlanCode } from './demoData';

/** Tous les agrégats Super Admin passent par ces fonctions — jamais de chiffre en dur dans une page. */

export function computeMRR(subs: DemoSubscription[]): number {
  return subs.filter((s) => s.status === 'ACTIVE').reduce((sum, s) => sum + s.monthlyAmountEur, 0);
}

export function computeARR(subs: DemoSubscription[]): number {
  return computeMRR(subs) * 12;
}

export function computePayingUsers(users: DemoUser[]): number {
  return users.filter((u) => u.plan !== 'FREE').length;
}

export function computeConversionRate(users: DemoUser[]): number {
  if (users.length === 0) return 0;
  return computePayingUsers(users) / users.length;
}

export function computeTotalMonthlyCosts(costs: DemoCost[]): number {
  return costs.reduce((sum, c) => sum + c.monthlyAmountEur, 0);
}

export function computeEstimatedMargin(subs: DemoSubscription[], costs: DemoCost[]): number {
  return computeMRR(subs) - computeTotalMonthlyCosts(costs);
}

export function computeARPU(users: DemoUser[], subs: DemoSubscription[]): number {
  if (users.length === 0) return 0;
  return computeMRR(subs) / users.length;
}

export function computeKeepsTotal(users: DemoUser[]): number {
  return users.reduce((sum, u) => sum + u.keepsThisMonth, 0);
}

/**
 * Filtre la liste Utilisateurs (recherche + plan). Logique isolée de la
 * page React pour rester testable avec `tsx` (voir scripts/verify.ts) --
 * aucune fonction de filtrage/agrégat de ce fichier ne doit vivre
 * uniquement dans un composant, sinon elle échappe à toute vérification
 * automatisée dans ce sandbox (pas de Jest/DOM disponible).
 */
export function filterUsers(users: DemoUser[], query: string, planFilter: PlanCode | 'ALL'): DemoUser[] {
  const normalizedQuery = query.trim().toLowerCase();
  return users.filter((u) => {
    const matchesPlan = planFilter === 'ALL' || u.plan === planFilter;
    const matchesQuery = normalizedQuery === '' || u.username.toLowerCase().includes(normalizedQuery) || u.country.toLowerCase().includes(normalizedQuery);
    return matchesPlan && matchesQuery;
  });
}
