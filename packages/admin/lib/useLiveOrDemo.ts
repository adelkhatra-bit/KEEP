import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, isBackendConfigured } from './apiClient';

export type DataMode = 'live' | 'demo';

export interface LiveOrDemoResult<T> {
  data: T;
  mode: DataMode;
  loading: boolean;
  /** Renseigné uniquement quand une tentative réelle a échoué (backend non configuré, 503, 401…). */
  reason?: string;
  refresh: () => void;
}

/**
 * Lit une ressource Super Admin réelle (packages/backend/src/routes/admin.ts)
 * quand c'est possible, avec repli honnête vers les données de démo sinon --
 * jamais un mélange silencieux des deux. `mode` dit toujours la vérité sur
 * l'origine des données affichées (voir bannière dans chaque page).
 */
export function useLiveOrDemo<TRaw, TShaped>(
  path: string,
  mapRaw: (raw: TRaw) => TShaped,
  demoData: TShaped
): LiveOrDemoResult<TShaped> {
  const [state, setState] = useState<Omit<LiveOrDemoResult<TShaped>, 'refresh'>>({
    data: demoData,
    mode: 'demo',
    loading: isBackendConfigured,
    reason: isBackendConfigured ? undefined : 'NEXT_PUBLIC_API_URL / Supabase non configurés côté admin.',
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isBackendConfigured) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    adminApi
      .get<{ data: TRaw }>(path)
      .then((res) => {
        if (cancelled) return;
        setState({ data: mapRaw(res.data), mode: 'live', loading: false });
      })
      .catch((err) => {
        if (cancelled) return;
        const reason =
          err instanceof AdminApiError ? `${err.message} (HTTP ${err.status})` : 'Backend injoignable.';
        setState({ data: demoData, mode: 'demo', loading: false, reason });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
