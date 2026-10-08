import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import InfoToggleIcon from '../../mobile/src/components/InfoToggleIcon';
import { supabase } from '../lib/supabaseClient';
import { commitLink, evidenceState, LEDGER_URL, parseOverview, readSiteVersion, ReportOverview, SiteVersion, testLink } from '../lib/releaseEvidence';

export default function ReleaseEvidence() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [site, setSite] = useState<SiteVersion | null>(null);
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [siteError, setSiteError] = useState('');
  const [reportError, setReportError] = useState('');
  const [loading, setLoading] = useState(false);
  const [observedAt, setObservedAt] = useState('');
  const active = useRef(true);
  const busy = useRef(false);
  const load = async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true); setSite(null); setOverview(null); setSiteError(''); setReportError('');
    await Promise.all([
      readSiteVersion().then(v => { if (active.current) setSite(v); })
        .catch(() => { if (active.current) setSiteError('Version inaccessible · réseau ou provenance à vérifier'); }),
      (async () => {
        if (!supabase) throw new Error('Supabase Super Admin non configuré.');
        const { data, error } = await supabase.rpc('admin_problem_report_overview');
        if (error) throw new Error('Rapport indisponible · droits ou migration serveur à vérifier');
        const value = parseOverview(data);
        if (active.current) setOverview(value);
      })().catch(e => { if (active.current) setReportError(e.message); }),
    ]);
    busy.current = false;
    if (active.current) { setObservedAt(new Date().toISOString()); setLoading(false); }
  };
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; }; }, []);
  const cells = [
    ['Site observé', site ? site.sha.slice(0, 8) : loading ? 'Chargement…' : 'Inconnu'],
    ['App signalée', overview?.latest_app?.app_version ?? (loading ? 'Chargement…' : 'Inconnue')],
    ['Problèmes ouverts', overview ? String(overview.open_count) : 'Indisponible'],
    ['Correctifs documentés', overview ? String(overview.documented_count) : 'Indisponible'],
  ];
  return <section className="card" aria-label="Versions et preuves" style={{ marginBottom: 22, minWidth: 0 }}>
    <h3 style={{ marginTop: 0 }}>Versions & preuves</h3>
    <button type="button" className="btn" disabled={loading} onClick={() => void load()}>{loading ? 'Lecture…' : 'Actualiser'}</button>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginTop: 16 }}>
      {cells.map(([label, value]) => <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
        <div>{label}</div><strong>{value}</strong>
      </div>)}
    </div>
    {siteError ? <p role="alert">{siteError}</p> : null}
    {reportError ? <p role="alert">{reportError}</p> : null}
    <details style={{ marginTop: 12 }} onToggle={event => setHelpOpen(event.currentTarget.open)}>
      <summary aria-label={helpOpen ? 'Réduire les explications' : 'En savoir plus'} aria-expanded={helpOpen} style={{ minHeight: 48, minWidth: 48, fontSize: 18 }}><InfoToggleIcon expanded={helpOpen} /></summary>
      <p>Lecture seule. Site : version.json canonique sans cache. App : dernier signalement iOS/Android, pas une version installée partout. Corrigé ≠ livré ≠ test réussi.</p>
      {observedAt ? <p>Observation : {new Date(observedAt).toLocaleString('fr-FR')}</p> : null}
      {site ? <p>Site : <a href={commitLink(site.sha)!} target="_blank" rel="noopener noreferrer">{site.sha}</a> · construit le {new Date(site.builtAt).toLocaleString('fr-FR')}</p> : null}
      {overview?.latest_app ? <p>App signalée : {overview.latest_app.platform} · {overview.latest_app.app_version ?? 'version inconnue'} · {overview.latest_app.build_sha ?? 'SHA inconnu'} · {new Date(overview.latest_app.created_at).toLocaleString('fr-FR')}</p> : null}
      {overview ? <p>Comptages exacts serveur : {overview.open_count} ouverts, {overview.fixed_count} déclarés corrigés, {overview.documented_count} avec SHA et test. Livraison globale inconnue ; l’égalité exacte avec le SHA du site est la seule correspondance affichée (sans inférer l’ascendance).</p> : null}
      <a href={LEDGER_URL} target="_blank" rel="noopener noreferrer">Registre des erreurs</a>
    </details>
    <h4>Corrections livrées ?</h4>
    <Link href="/problem-reports">Signalements & preuves</Link>
    {overview ? <div>
      <p>{overview.fixes.length} / {overview.fixed_count} correctifs · liste limitée à {overview.fixes_limit}</p>
      {!overview.fixes.length ? <p>Aucun correctif déclaré</p> : null}
      {overview.fixes.map(fix => <article key={fix.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0', overflowWrap: 'anywhere' }}>
        <strong>{fix.screen ?? 'Écran inconnu'}</strong> · {evidenceState(fix, site)}
        <details><summary>Preuves</summary>
          <div>Signalement : {fix.id} · {fix.status} · {fix.resolved_at ? new Date(fix.resolved_at).toLocaleString('fr-FR') : 'date inconnue'}</div>
          {commitLink(fix.fixed_in_sha) ? <div><a href={commitLink(fix.fixed_in_sha)!} target="_blank" rel="noopener noreferrer">Commit {fix.fixed_in_sha}</a></div> : <div>SHA absent ou invalide</div>}
          {testLink(fix.fixed_in_sha, fix.regression_test_path) ? <div><a href={testLink(fix.fixed_in_sha, fix.regression_test_path)!} target="_blank" rel="noopener noreferrer">Test anti-régression</a> · exécution non attestée</div> : <div>Test non associé</div>}
        </details>
      </article>)}
    </div> : null}
  </section>;
}
