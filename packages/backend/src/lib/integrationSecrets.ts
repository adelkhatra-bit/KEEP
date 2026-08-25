import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.KEEP_CONFIG_ENCRYPTION_KEY;
  if (!raw) throw new Error('KEEP_CONFIG_ENCRYPTION_KEY manquant');
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decrypt(payload: string): string {
  const [ivRaw, tagRaw, dataRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error('Secret chiffré invalide');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataRaw, 'base64url')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function secretHint(value: string): string {
  if (!value) return '';
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
  const { data, error } = await db
    .from('integration_secrets')
    .upsert({
      key: args.key,
      category: args.category,
      encrypted_value: encrypt(args.value),
      value_hint: secretHint(args.value),
      is_configured: true,
      updated_by: args.updatedBy || null,
      updated_at: new Date().toISOString(),
    })
    .select('key,category,value_hint,is_configured,updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIntegrationSecret(key: string) {
  const db = client();
  if (!db) throw new Error('Supabase service role non configuré');
  const { error } = await db.from('integration_secrets').delete().eq('key', key);
  if (error) throw error;
}

export async function getIntegrationSecret(key: string): Promise<string | null> {
  const db = client();
  if (!db) return process.env[key] || null;
  const { data, error } = await db
    .from('integration_secrets')
    .select('encrypted_value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data?.encrypted_value) return process.env[key] || null;
  return decrypt(data.encrypted_value);
}
