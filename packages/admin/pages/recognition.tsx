import React from 'react';
import AdminLayout from '../components/AdminLayout';
import DataModeBanner from '../components/DataModeBanner';
import { useLiveOrDemo } from '../lib/useLiveOrDemo';

interface RecognitionStats {
  totalCalls: number;
  byOutcome: Record<string, number>;
  byProvider: Record<string, number>;
  avgLatencyMs: number;
  successRate: number;
  quotaErrors: number;
}

const DEMO_STATS: RecognitionStats = {
  totalCalls: 0,
  byOutcome: {},
  byProvider: {},
  avgLatencyMs: 0,
  successRate: 0,
  quotaErrors: 0,
};

const OUTCOME_LABELS: Record<string, string> = {
  success: 'Reconnu',
  no_match: 'Aucune correspondance',
  already_seen: 'Déjà vu (cooldown)',
  quota_error: 'Quota/autorisation',
  error: 'Erreur transitoire',
};

/**
 * Écran "RECONNAISSANCE" -- suivi des providers de reconnaissance musicale
 * (cf. demande explicite du 23/08/2026 : "providers actifs, quotas, erreurs,
 * nombre d'appels, coût estimé, latence moyenne, taux de reconnaissance").
 *
 * STATUT HONNÊTE : GET /api/admin/recognition-stats est réel et agrège la
 * table `recognition_events` (voir supabase/migrations/0002). MAIS le
 * mobile n'écrit pas encore dans cette table -- son journal réel vit
 * aujourd'hui en local (voir useRecognitionTelemetryStore.ts côté mobile).
 * Tant que ce pont n'est pas branché, cet écran affichera honnêtement des
 * compteurs à zéro même en Mode Réel (backend connecté) -- jamais un
 * chiffre inventé pour "faire joli".
 */
export default function Recognition() {
  const result = useLiveOrDemo<RecognitionStats, RecognitionStats>('/recognition-stats', (r) => r, DEMO_STATS);
  const stats = result.data;
  const outcomeEntries = Object.entries(stats.byOutcome).sort((a, b) => b[1] - a[1]);
  const providerEntries = Object.entries(stats.byProvider).sort((a, b) => b[1] - a[1]);

  return (
    <AdminLayout>
      <div className="page-title">Reconnaissance</div>
      <div className="page-subtitle">Suivi des providers de reconnaissance musicale (AudD et futurs providers)</div>

      <DataModeBanner
        mode={result.mode}
        loading={result.loading}
        reason={result.reason}
        demoNote="aucun événement -- le mobile n'envoie pas encore son journal au backend (voir note dans le code)."
      />

      {result.mode === 'live' && stats.totalCalls === 0 && (
        <p className="save-hint">
          Backend connecté, mais 0 événement enregistré -- le mobile journalise en local
          (useRecognitionTelemetryStore) et ne poste pas encore vers ce backend. Pas un bug de
          cet écran, une étape de câblage qui reste à faire.
        </p>
      )}

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-value">{stats.totalCalls}</div><div className="kpi-label">Appels totaux</div></div>
        <div className="kpi-card"><div className="kpi-value">{stats.successRate}%</div><div className="kpi-label">Taux de reconnaissance</div></div>
        <div className="kpi-card"><div className="kpi-value">{stats.avgLatencyMs} ms</div><div className="kpi-label">Latence moyenne</div></div>
        <div className="kpi-card"><div className="kpi-value">{stats.quotaErrors}</div><div className="kpi-label">Erreurs quota/autorisation</div></div>
      </div>

      <div className="page-subtitle" style={{ marginTop: 32 }}>Par résultat</div>
      <table>
        <thead><tr><th>Résultat</th><th>Nombre</th></tr></thead>
        <tbody>
          {outcomeEntries.length === 0 ? (
            <tr><td colSpan={2} style={{ color: 'var(--text-muted)' }}>Aucun événement pour l'instant.</td></tr>
          ) : (
            outcomeEntries.map(([outcome, count]) => (
              <tr key={outcome}>
                <td>{OUTCOME_LABELS[outcome] ?? outcome}</td>
                <td>{count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="page-subtitle" style={{ marginTop: 32 }}>Par provider</div>
      <table>
        <thead><tr><th>Provider</th><th>Appels</th></tr></thead>
        <tbody>
          {providerEntries.length === 0 ? (
            <tr><td colSpan={2} style={{ color: 'var(--text-muted)' }}>Aucun événement pour l'instant.</td></tr>
          ) : (
            providerEntries.map(([provider, count]) => (
              <tr key={provider}>
                <td>{provider}</td>
                <td>{count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="save-hint">
        Coût estimé non affiché : AudD facture au-delà du free tier (300 requêtes/mois) mais
        aucune grille tarifaire n'est encore saisie côté KEEP -- pas de faux montant tant que ce
        n'est pas réel.
      </p>
    </AdminLayout>
  );
}
