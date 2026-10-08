import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { supabase } from '../lib/supabaseClient';

type Overview = {
  catalog: { total: number; added24h: number; added7d: number };
  queue: { pending: number; processing: number };
  styles: Array<{ key: string; label: string; profiles: number; score: number }>;
  discoverers: Array<{ id: string; username: string; tracks: number }>;
  platforms: Array<{ provider: string; items: number }>;
  pulse: { pairs: number; repeated: number; repeatPercent: number | null };
  pulseLatencyMs: number | null;
  observedAt: string;
};
const PLATFORMS: Record<string, string> = {
  apple_music: 'Apple Music', spotify: 'Spotify', deezer: 'Deezer',
  youtube_music: 'YouTube Music', soundcloud: 'SoundCloud', tidal: 'Tidal',
};

export default function Music() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = async () => {
    setLoading(true);
    setError(false);
    setData(null);
    try {
      if (!supabase) throw new Error('unconfigured');
      const response = await supabase.rpc('admin_music_overview');
      if (response.error || !response.data) throw new Error('unavailable');
      const value = response.data as Overview;
      const counts = [value.catalog?.total, value.catalog?.added24h, value.catalog?.added7d,
        value.queue?.pending, value.queue?.processing, value.pulse?.pairs, value.pulse?.repeated];
      const countValid = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
      if (!counts.every(countValid)
        || !Array.isArray(value.styles) || !value.styles.every(s => typeof s.key === 'string' && typeof s.label === 'string' && countValid(s.profiles))
        || !Array.isArray(value.discoverers) || !value.discoverers.every(d => typeof d.id === 'string' && typeof d.username === 'string' && countValid(d.tracks))
        || !Array.isArray(value.platforms) || !value.platforms.every(p => typeof p.provider === 'string' && countValid(p.items))
        || !(value.pulse.repeatPercent === null || (Number.isFinite(value.pulse.repeatPercent) && value.pulse.repeatPercent >= 0 && value.pulse.repeatPercent <= 100))
        || !(value.pulseLatencyMs === null || (Number.isFinite(value.pulseLatencyMs) && value.pulseLatencyMs >= 0))) {
        throw new Error('invalid-overview');
      }
      setData(value);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);
  const unavailable = loading ? '…' : 'Indisponible';
  const count = (value: number | undefined) => value === undefined ? unavailable : value.toLocaleString('fr-FR');

  return <AdminLayout>
    <section aria-label="Statistiques musicales">
      <div className="page-title">Musique<Hint title="Musique" text="Lecture seule des données existantes. Styles, découvreurs, bibliothèques et répétitions excluent les comptes test via keep_is_test_profile. Le catalogue mondial et sa file cron ne sont pas des comptes utilisateur." /></div>
      <button className="btn" disabled={loading} onClick={() => void load()}>Actualiser</button>
      {error && <p role="alert">Indisponible<Hint title="Indisponible" text="Les statistiques n’ont pas pu être lues. Vérifier le réseau, le rôle admin et l’application de la migration admin_music_overview. Aucune valeur de repli à zéro." /></p>}
      <div className="music-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Catalogue<Hint title="Catalogue" text="Titres canoniques de tracks : nouveaux enregistrements sur 24 heures et 7 jours glissants, y compris l’alimentation par le cron mondial. Ce ne sont pas les résultats du fournisseur, qui peuvent contenir des doublons. File : recherches PENDING/RETRY et PROCESSING dans keep_world_catalog_expansion_queue." /></h2>
          <Metric label="Titres" value={count(data?.catalog.total)} />
          <Metric label="24h" value={count(data?.catalog.added24h)} />
          <Metric label="7j" value={count(data?.catalog.added7d)} />
          <Metric label="Attente" value={count(data?.queue.pending)} />
          <Metric label="Traitement" value={count(data?.queue.processing)} />
        </div>
        <div className="card">
          <h2>Pulse<Hint title="Pulse" text="Répétition : part des couples utilisateur/titre exposés au moins deux fois (last_shown_at > first_shown_at), sur tout l’historique existant, hors tests. Temps : moyenne d’exécution serveur de keep_loki_pulse dans pg_stat_statements depuis sa dernière remise à zéro, pas une latence réseau ni une mesure par profil. Cette télémétrie technique globale ne permet pas de distinguer les sessions test. Indisponible si l’extension ou les mesures manquent. Aucun appel de Pulse, aucune exposition ni notification créée par cette vue." /></h2>
          <Metric label="Temps" value={data?.pulseLatencyMs == null ? unavailable : `${data.pulseLatencyMs.toLocaleString('fr-FR')} ms`} />
          <Metric label="Répétition" value={data?.pulse.repeatPercent == null ? unavailable : `${data.pulse.repeatPercent.toLocaleString('fr-FR')} %`} />
          <Metric label="Couples" value={count(data?.pulse.pairs)} />
        </div>
        <Ranking title="Styles" help="Top 10 GENRE de profile_music_taste_scores, scores positifs uniquement. Classement par nombre d’utilisateurs puis somme des scores ; comptes test exclus." loading={loading} available={Boolean(data)}
          rows={data?.styles.map((s) => ({ id: s.key, label: s.label, value: s.profiles }))} />
        <Ranking title="Découvreurs" help="Top 10 premiers découvreurs immuables de keep_track_first_discoveries, par nombre de titres. Comptes test exclus ; aucune attribution modifiée." loading={loading} available={Boolean(data)}
          rows={data?.discoverers.map((d) => ({ id: d.id, label: d.username, value: d.tracks }))} />
        <Ranking title="Plateformes" help="Éléments actifs de music_library_items par fournisseur, removed_at vide, hors comptes test. Une musique importée sur plusieurs services peut figurer dans plusieurs totaux." loading={loading} available={Boolean(data)}
          rows={data?.platforms.map((p) => ({ id: p.provider, label: PLATFORMS[p.provider] || p.provider, value: p.items }))} />
      </div>
    </section>
  </AdminLayout>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><b>{value}</b></div>;
}

function Ranking({ title, help, rows, loading, available }: {
  title: string; help: string; rows?: Array<{ id: string; label: string; value: number }>; loading: boolean; available: boolean;
}) {
  return <div className="card">
    <h2>{title}<Hint title={title} text={help} /></h2>
    {!available ? <p>{loading ? '…' : 'Indisponible'}</p> : rows?.length ? (
      <ol style={{ margin: 0, paddingLeft: 24 }}>
        {rows.map((row) => <li key={row.id}><div className="stat"><span>{row.label}</span><b>{row.value.toLocaleString('fr-FR')}</b></div></li>)}
      </ol>
    ) : <p>Aucun</p>}
  </div>;
}
