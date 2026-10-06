import fs from 'fs';
import path from 'path';

describe('Battle deep catalog expansion', () => {
  const seed = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-battle-catalog-seed', 'index.ts'), 'utf8');
  const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001023000_battle_catalog_batch_ingest.sql'), 'utf8');

  it('deepens French music far beyond the previous two generic searches', () => {
    expect(seed).toContain('"Gilbert Montagné"');
    expect(seed).toContain('"Jean-Jacques Goldman"');
    expect(seed).toContain('"Édith Piaf"');
    expect(seed).toContain('"Zaho de Sagazan"');
    expect(seed).toContain('CHANSON_FR: 4000');
    expect(seed).toContain('FRENCH_DEEP_TERMS');
  });

  it('keeps provider requests bounded and database writes batched', () => {
    expect(seed).toContain('QUERY_CONCURRENCY = 10');
    expect(seed).toContain('BATCH_QUERY_COUNT = 5');
    expect(seed).toContain('totalBatches');
    expect(seed).toContain('DB_BATCH_SIZE = 400');
    expect(seed).toContain('service_battle_catalog_ingest');
    expect(migration).toContain('ord <= 500');
  });

  it('keeps the ingestion RPC private to service role', () => {
    expect(migration).toContain('revoke all on function public.service_battle_catalog_ingest(text,jsonb) from anon');
    expect(migration).toContain('revoke all on function public.service_battle_catalog_ingest(text,jsonb) from authenticated');
    expect(migration).toContain('grant execute on function public.service_battle_catalog_ingest(text,jsonb) to service_role');
  });
});
