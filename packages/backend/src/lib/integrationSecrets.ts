import { createClient } from '@supabase/supabase-js';

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function secretHint(value: string): string {
  if (!value) return '';
  if (value.includes('@') && !value.includes(' ')) {
    const [left, domain] = value.split('@');
    return `${left.slice(0, 2)}•••@${domain}`;
  }
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 3)}••••••${value.slice(-4)}`;
}

export async function listIntegrationSecrets() {
  const db = client();
  if (!db) throw new Error('Supabase service role non configuré');
  const { data, error } = await db
    .from('integration_secrets')
    .select('key,category,value_hint,is_configured,updated_at')
    .order('category')
    .order('key');
  if (error) throw error;
  return data ?? [];
}

export async function setIntegrationSecret(args: {
  key: string;
  category: string;
  value: string;
  updatedBy?: string;
}) {
  const db = client();
  if (!db) throw new Error('Supabase service role non configuré');
  const hint = secretHint(args.value);
  const { error } = await db.rpc('service_set_integration_secret', {
    p_key: args.key,
    p_category: args.category,
    p_value: args.value,
    p_hint: hint,
    p_updated_by: args.updatedBy || null,
  });
  if (error) throw error;

  const { data, error: readError } = await db
    .from('integration_secrets')
    .select('key,category,value_hint,is_configured,updated_at')
    .eq('key', args.key)
    .single();
  if (readError) throw readError;
  return data;
}

export async function deleteIntegrationSecret(key: string) {
  const db = client();
  if (!db) throw new Error('Supabase service role non configuré');
  const { error } = await db.rpc('service_delete_integration_secret', { p_key: key });
  if (error) throw error;
}

export async function getIntegrationSecret(key: string): Promise<string | null> {
  const db = client();
  if (!db) return process.env[key] || null;
  const { data, error } = await db.rpc('service_get_integration_secret', { p_key: key });
  if (error) throw error;
  return typeof data === 'string' && data.length ? data : process.env[key] || null;
}
