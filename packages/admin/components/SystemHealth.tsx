import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { healthIntegrationHref, healthState, parseSystemHealth, SystemHealth as HealthData } from '../lib/systemHealth';

export default function SystemHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!supabase) throw new Error('Supabase Super Admin non configuré.');
        const result = await supabase.rpc('admin_system_health');
        if (result.error) throw new Error('Santé indisponible · droits ou migration à vérifier');
        const health = parseSystemHealth(result.data);
        if (active) { setData(health); setError(''); }
      } catch (e: any) { if (active) { setData(null); setError(e.message ?? 'Santé indisponible'); } }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const incidents = data?.services.filter(row => healthState(row) === 'ERROR').length;
  return <section className="card" aria-label="Santé des services" style={{ marginBottom: 20 }}>
    <h2 style={{ marginTop: 0 }}>Santé · {incidents === undefined ? 'Indisponible' : `${incidents} incident(s)`}</h2>
    {error ? <div role="alert">{error}</div> : !data ? <div>Chargement…</div> : <>
      {!data.services.length ? <p>Surveillance non exécutée · aucun service validé</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {data.services.map(row => {
          const state = healthState(row);
          return <details key={row.provider} style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
            <summary style={{ cursor: 'pointer', minHeight: 48, display: 'list-item' }}>
              {state === 'OK' ? '✅' : state === 'ERROR' ? '❌' : '❔'} {row.provider}
            </summary>
            <div>{state === 'UNKNOWN' ? 'Non vérifié ou contrôle périmé' : state === 'ERROR' ? 'Incident ouvert' : 'Test réel réussi'}</div>
            <div>{row.last_checked_at ? new Date(row.last_checked_at).toLocaleString('fr-FR') : 'Jamais contrôlé'}</div>
            {row.last_error ? <div>{row.last_error}</div> : null}
            {row.metadata ? <div>{JSON.stringify(row.metadata)}</div> : null}
            {row.provider.startsWith('cron:') || row.provider.startsWith('edge:') ?
              <a href={`https://supabase.com/dashboard/project/rrhqsqzcplvmwxizqnla/${row.provider.startsWith('cron:') ? 'integrations/cron/overview' : 'functions'}`} target="_blank" rel="noopener noreferrer">Ouvrir la tâche concernée</a> :
              <Link href={healthIntegrationHref(row.provider)}>Ouvrir la clé / la tâche concernée</Link>}
          </details>;
        })}
      </div>
      <div style={{ marginTop: 12 }}><h3>Résumé du jour · UTC · système global</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
          {([['new_reports', 'Nouveaux signalements'], ['failed_emails', 'E-mails échoués'], ['push_no_device', 'Push sans appareil'], ['waiting_qr', 'QR en attente']] as const).map(([key, label]) =>
            <div key={key}>{label} : <strong>{data.daily[key] ?? 'Indisponible'}</strong></div>)}
        </div>
      </div>
    </>}
  </section>;
}
