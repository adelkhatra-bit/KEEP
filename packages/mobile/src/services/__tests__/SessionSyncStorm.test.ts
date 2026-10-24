// ERR-SESSION-SYNC-STORM-20261020 : journaux Supabase du 20/10 (build 445) -- jusqu'à 8 écritures
// keep_sync_device_session et 1 relecture complète par seconde au démarrage.
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'sessionCloudSyncService.ts'), 'utf8');

describe('synchro des sessions : pas de tempête de requêtes', () => {
  it('compare les sessions indépendamment de l\'ordre des clés jsonb', () => {
    expect(source).toContain('function canonical(value: unknown): unknown');
    expect(source).toContain('Object.keys(value as Record<string, unknown>).sort()');
    expect(source).toContain('return JSON.stringify(canonical({');
  });

  it('ne re-supprime pas au démarrage une session déjà supprimée dans le cloud', () => {
    expect(source).toContain('const remoteDeleted = new Set(rows.filter((r) => r.deleted_at).map((r) => r.session_id));');
    expect(source).toContain('if (remoteIds.has(id) && !remoteDeleted.has(id) && !localIds.has(id)) tombstones.add(id);');
  });

  it('ignore l\'écho Realtime de ses propres écritures', () => {
    expect(source).toContain('if (writing || Date.now() - lastOwnWriteAt < 2500) return;');
    expect(source).toContain('const PULL_EVERY_MS = 12000');
  });
});

describe('canonical : même contenu, même empreinte', () => {
  it('donne la même chaîne quel que soit l\'ordre des clés', () => {
    const body = source.slice(source.indexOf('function canonical'), source.indexOf('function serial'));
    // eslint-disable-next-line no-new-func
    const canonical = new Function(`${body.replace(/: unknown/g, '').replace(/as Record<string, unknown>/g, '').replace(/const out: Record<string, unknown>/, 'const out')}; return canonical;`)();
    const a = { id: 's1', tracks: [{ id: 't', status: 'kept', track: { title: 'A', artist: 'B' } }], startedAt: 'x' };
    const b = { startedAt: 'x', tracks: [{ track: { artist: 'B', title: 'A' }, status: 'kept', id: 't' }], id: 's1' };
    expect(JSON.stringify(canonical(a))).toBe(JSON.stringify(canonical(b)));
    expect(JSON.stringify(canonical({ ...a, tracks: [{ ...a.tracks[0], status: 'passed' }] }))).not.toBe(JSON.stringify(canonical(b)));
  });
});
