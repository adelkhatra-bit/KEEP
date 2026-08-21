import React from 'react';
import AdminLayout from '../components/AdminLayout';
import { DEMO_USERS, DEMO_SUBSCRIPTIONS, DEMO_COSTS } from '../lib/demoData';
import {
  computeMRR,
  computeARR,
  computePayingUsers,
  computeConversionRate,
  computeARPU,
  computeKeepsTotal,
  computeEstimatedMargin,
} from '../lib/aggregate';

export default function Dashboard() {
  const mrr = computeMRR(DEMO_SUBSCRIPTIONS);
  const arr = computeARR(DEMO_SUBSCRIPTIONS);
  const paying = computePayingUsers(DEMO_USERS);
  const conversion = computeConversionRate(DEMO_USERS);
  const arpu = computeARPU(DEMO_USERS, DEMO_SUBSCRIPTIONS);
  const keeps = computeKeepsTotal(DEMO_USERS);
  const margin = computeEstimatedMargin(DEMO_SUBSCRIPTIONS, DEMO_COSTS);

  return (
    <AdminLayout>
      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Vue d'ensemble — France (EUR)</div>

      <div className="demo-banner">
        🎭 MODE DÉMO — données fictives ({DEMO_USERS.length} utilisateurs
        d'exemple), aucun projet Supabase connecté. Tous les chiffres
        ci-dessous sont calculés à partir de ces données d'exemple, pas
        codés en dur (voir packages/admin/lib/aggregate.ts).
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-value">{DEMO_USERS.length}</div><div className="kpi-label">Utilisateurs totaux</div></div>
        <div className="kpi-card"><div className="kpi-value">{paying}</div><div className="kpi-label">Abonnés payants</div></div>
        <div className="kpi-card"><div className="kpi-value">{(conversion * 100).toFixed(0)}%</div><div className="kpi-label">Conversion Free → payant</div></div>
        <div className="kpi-card"><div className="kpi-value">{mrr.toFixed(2)} €</div><div className="kpi-label">MRR</div></div>
        <div className="kpi-card"><div className="kpi-value">{arr.toFixed(0)} €</div><div className="kpi-label">ARR</div></div>
        <div className="kpi-card"><div className="kpi-value">{arpu.toFixed(2)} €</div><div className="kpi-label">ARPU</div></div>
        <div className="kpi-card"><div className="kpi-value">{keeps}</div><div className="kpi-label">GARDER ce mois</div></div>
        <div className="kpi-card"><div className="kpi-value">{margin.toFixed(2)} €</div><div className="kpi-label">Marge estimée / mois</div></div>
      </div>

      <table>
        <thead>
          <tr><th>Utilisateur</th><th>Pays</th><th>Plan</th><th>GARDER ce mois</th></tr>
        </thead>
        <tbody>
          {DEMO_USERS.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.country}</td>
              <td>{u.plan}</td>
              <td>{u.keepsThisMonth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
