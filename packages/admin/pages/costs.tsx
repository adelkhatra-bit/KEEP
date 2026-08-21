import React from 'react';
import AdminLayout from '../components/AdminLayout';
import { DEMO_COSTS, DEMO_SUBSCRIPTIONS } from '../lib/demoData';
import { computeMRR, computeTotalMonthlyCosts, computeEstimatedMargin } from '../lib/aggregate';

/**
 * Écran "COÛTS & RENTABILITÉ" — cf. demande explicite du 21/08/2026.
 * Tableau de gestion (pas un remplaçant d'expert-comptable) : donne une
 * estimation de marge, pas une vérité comptable officielle.
 */
export default function Costs() {
  const revenue = computeMRR(DEMO_SUBSCRIPTIONS);
  const totalCosts = computeTotalMonthlyCosts(DEMO_COSTS);
  const margin = computeEstimatedMargin(DEMO_SUBSCRIPTIONS, DEMO_COSTS);
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

  return (
    <AdminLayout>
      <div className="page-title">Coûts & Rentabilité</div>
      <div className="page-subtitle">Tableau de gestion — estimation, pas une clôture comptable officielle</div>

      <div className="demo-banner">
        🎭 MODE DÉMO — coûts saisis à titre d'exemple. En Mode Réel, cet écran
        lira `operating_costs` (voir supabase/migrations/0003_commerce.sql) et
        permettra la saisie/modification directement ici.
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-value">{revenue.toFixed(2)} €</div><div className="kpi-label">Revenus (MRR)</div></div>
        <div className="kpi-card"><div className="kpi-value">{totalCosts.toFixed(2)} €</div><div className="kpi-label">Coûts opérationnels / mois</div></div>
        <div className="kpi-card"><div className="kpi-value">{margin.toFixed(2)} €</div><div className="kpi-label">Marge estimée / mois</div></div>
        <div className="kpi-card"><div className="kpi-value">{marginPercent.toFixed(0)}%</div><div className="kpi-label">Marge en % du revenu</div></div>
      </div>

      <table>
        <thead>
          <tr><th>Catégorie</th><th>Libellé</th><th>Coût mensuel</th></tr>
        </thead>
        <tbody>
          {DEMO_COSTS.map((c, i) => (
            <tr key={i}>
              <td>{c.category}</td>
              <td>{c.label}</td>
              <td>{c.monthlyAmountEur.toFixed(2)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="save-hint">
        Commissions Apple/Google non incluses ici tant qu'aucune transaction
        réelle n'existe — voir docs/PLATFORM_COMPLIANCE.md pour les taux
        (15% abonnements après réduction, historiquement 30%).
      </p>
    </AdminLayout>
  );
}
