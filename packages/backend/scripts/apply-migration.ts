/**
 * Applique une ou plusieurs migrations Supabase via la Management API,
 * authentifiée par un Personal Access Token (PAT) -- JAMAIS le mot de passe
 * de la base (règle absolue de ce projet). PAT généré le 23/08/2026 par
 * Adel depuis supabase.com/dashboard/account/tokens, stocké dans
 * SUPABASE_MANAGEMENT_ACCESS_TOKEN (.env, jamais commité).
 *
 * Usage : npx ts-node scripts/apply-migration.ts <fichier1.sql> [fichier2.sql ...]
 * S'arrête à la première erreur -- n'enchaîne jamais sur un état incertain.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';

async function applyOne(file: string, token: string, ref: string): Promise<void> {
  const sql = await readFile(file, 'utf-8');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${file} -> HTTP ${res.status}: ${text}`);
  }
  console.log(`OK: ${file}`);
}

async function main() {
  const token = process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) throw new Error('SUPABASE_MANAGEMENT_ACCESS_TOKEN / SUPABASE_PROJECT_REF manquants dans .env');

  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error('Usage: apply-migration.ts <fichier1.sql> [...]');

  for (const file of files) {
    await applyOne(file, token, ref);
  }
  console.log(`\n${files.length} migration(s) appliquée(s) avec succès.`);
}

main().catch((e) => {
  console.error('ÉCHEC:', e.message);
  process.exit(1);
});
