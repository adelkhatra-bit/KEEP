import type { KeepSession } from '../types';
import { supabase } from './supabaseClient';
import { isCloudProfileRecoverySession, useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useUserStore } from '../store/useUserStore';

type CloudRow = {
  session_id: string;
  snapshot: KeepSession;
  updated_at: string;
  deleted_at: string | null;
};

const PULL_EVERY_MS = 12000; // filet de sécurité si Realtime est temporairement déconnecté
const REALTIME_DEBOUNCE_MS = 180;
const WRITE_DELAY_MS = 900;

function validSnapshot(value: unknown): value is KeepSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<KeepSession>;
  return typeof session.id === 'string' && !!session.id
    && typeof session.startedAt === 'string'
    && Array.isArray(session.tracks)
    && session.tracks.every((item) =>
      typeof item?.id === 'string' &&
      typeof item?.track?.title === 'string' &&
      typeof item?.track?.artist === 'string');
}

function serial(session: KeepSession): string {
  // Le verrou de crédits dépend de l'appareil/solde courant, pas du morceau.
  return JSON.stringify({
    ...session,
    tracks: session.tracks.map(({ creditLocked: _creditLocked, ...entry }) => entry),
  });
}

/**
 * Miroir authentifié PC ↔ iOS : métadonnées et décisions, jamais d'audio ni
 * de jeton QR. Les sessions d'un autre compte ne sont jamais téléchargées
 * ni téléversées. Les échecs réseau préservent intégralement AsyncStorage.
 */
export function startCrossDeviceSessionSync(userId: string): () => void {
  if (!supabase || !userId) return () => {};
  const client = supabase;
  let stopped = false;
  let ready = false;
  let reading = false;
  let writing = false;
  let applying = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let realtimePullTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, KeepSession>();
  const tombstones = new Set<string>();
  const seenLocal = new Map<string, string>();
  const seenRemote = new Map<string, string>();

  const sameIdentity = () => {
    const state = useUserStore.getState();
    return !stopped && state.user?.id === userId && !state.isLocalGuest && !state.isDemoMode;
  };
  const owned = (s: KeepSession) =>
    s.ownerUserId === userId && !isCloudProfileRecoverySession(s);

  const verifiedSession = async () => {
    if (!sameIdentity()) return false;
    try {
      const { data, error } = await client.auth.getSession();
      return !error && sameIdentity() && data.session?.user?.id === userId;
    } catch { return false; }
  };

  function scheduleFlush() {
    if (!sameIdentity() || flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, WRITE_DELAY_MS);
  }

  function scan() {
    if (!ready || applying || !sameIdentity()) return;
    const state = useSessionHistoryStore.getState();
    const present = new Set<string>();
    for (const session of state.sessions) {
      if (!owned(session)) continue;
      present.add(session.id);
      const stamp = serial(session);
      if (seenLocal.get(session.id) !== stamp) {
        seenLocal.set(session.id, stamp);
        pending.set(session.id, session);
      }
    }
    // Supprimer côté cloud UNIQUEMENT après un geste explicite dans Mes Sessions.
    for (const id of state.dismissedSessionIds) {
      if (seenLocal.has(id) && !present.has(id)) {
        pending.delete(id);
        tombstones.add(id);
        seenLocal.delete(id);
      }
    }
    if (pending.size || tombstones.size) scheduleFlush();
  }

  async function flush() {
    if (writing || !ready || !sameIdentity() || !(await verifiedSession())) return;
    writing = true;
    try {
      for (const id of [...tombstones]) {
        if (!sameIdentity()) return;
        const { data, error } = await client.rpc('keep_sync_device_session', {
          p_session_id: id, p_snapshot: {}, p_deleted: true,
        });
        if (error || data !== true) break;
        tombstones.delete(id);
      }
      for (const [id, session] of [...pending.entries()]) {
        if (!sameIdentity()) return;
        if (tombstones.has(id)) continue;
        const { data, error } = await client.rpc('keep_sync_device_session', {
          p_session_id: id, p_snapshot: JSON.parse(serial(session)), p_deleted: false,
        });
        if (error) break;
        if (pending.get(id) === session) pending.delete(id);
        if (data === false) pending.delete(id); // Tombstone distante anti-résurrection.
      }
    } catch {
      // En cas de panne, la file reste disponible pour le prochain cycle.
    } finally { writing = false; }
  }

  async function pull() {
    if (!sameIdentity() || reading || !useSessionHistoryStore.persist.hasHydrated()) return;
    if (!(await verifiedSession())) return;
    reading = true;
    try {
      const { data, error } = await client.from('keep_device_sessions')
        .select('session_id,snapshot,updated_at,deleted_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }).limit(1000);
      if (error || !sameIdentity()) return;
      const rows = (data ?? []) as CloudRow[];
      const remoteIds = new Set(rows.map((r) => r.session_id));
      const current = useSessionHistoryStore.getState();
      const byId = new Map(current.sessions.map((s) => [s.id, s]));
      const dismissed = new Set(current.dismissedSessionIds);
      let changed = false;

      for (const row of rows) {
        const stamp = row.updated_at + ':' + (row.deleted_at ?? '');
        if (row.deleted_at) {
          if (!dismissed.has(row.session_id)) {
            dismissed.add(row.session_id);
            changed = true;
          }
          if (byId.get(row.session_id)?.ownerUserId === userId) {
            byId.delete(row.session_id);
            changed = true;
          }
          pending.delete(row.session_id);
          tombstones.delete(row.session_id);
          seenLocal.delete(row.session_id);
          seenRemote.set(row.session_id, stamp);
          continue;
        }
        if (pending.has(row.session_id) || tombstones.has(row.session_id)) continue;
        if (seenRemote.get(row.session_id) === stamp) continue;
        if (!validSnapshot(row.snapshot) || row.snapshot.id !== row.session_id) continue;
        const incoming: KeepSession = { ...row.snapshot, ownerUserId: userId };
        const existing = byId.get(row.session_id);
        if (!existing || serial(existing) !== serial(incoming)) {
          byId.set(row.session_id, incoming);
          changed = true;
        }
        seenLocal.set(row.session_id, serial(incoming));
        seenRemote.set(row.session_id, stamp);
      }

      applying = true;
      try {
        if (changed) useSessionHistoryStore.setState({
          sessions: [...byId.values()].filter((s) =>
            !(s.ownerUserId === userId && dismissed.has(s.id))),
          dismissedSessionIds: [...dismissed],
        });
      } finally { applying = false; }

      if (!ready) {
        ready = true;
        for (const session of useSessionHistoryStore.getState().sessions) {
          if (!owned(session) || dismissed.has(session.id)) continue;
          seenLocal.set(session.id, serial(session));
          if (!remoteIds.has(session.id)) pending.set(session.id, session);
        }
        const localIds = new Set(useSessionHistoryStore.getState().sessions.map((s) => s.id));
        for (const id of current.dismissedSessionIds) {
          if (remoteIds.has(id) && !localIds.has(id)) tombstones.add(id);
        }
      }
      scan();
      if (pending.size || tombstones.size) scheduleFlush();
    } catch {
      // Aucune suppression locale si le chargement distant est indisponible.
    } finally { reading = false; }
  }

  // Propagation quasi immédiate des changements PC ↔ iPhone. Les notifications
  // utilisent déjà Realtime ; le miroir des sessions doit aussi recevoir les
  // INSERT/UPDATE de keep_device_sessions (publication configurée côté SQL).
  // Le polling à 12 s reste un repli lors d'une coupure de websocket.
  const channel = client.channel('device-session-sync-' + userId + '-' + Math.random().toString(36).slice(2, 8))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'keep_device_sessions', filter: 'user_id=eq.' + userId,
    }, () => {
      if (!sameIdentity() || realtimePullTimer) return;
      realtimePullTimer = setTimeout(() => {
        realtimePullTimer = null;
        void pull().then(flush);
      }, REALTIME_DEBOUNCE_MS);
    }).subscribe();

  const unsubscribe = useSessionHistoryStore.subscribe(scan);
  const timer = setInterval(() => { void pull().then(flush); }, PULL_EVERY_MS);
  void pull();
  return () => {
    stopped = true;
    unsubscribe();
    void client.removeChannel(channel);
    if (realtimePullTimer) clearTimeout(realtimePullTimer);
    clearInterval(timer);
    if (flushTimer) clearTimeout(flushTimer);
  };
}
