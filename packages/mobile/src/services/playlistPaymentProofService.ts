import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabaseClient';

const BUCKET = 'playlist-payment-proofs';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export type PlaylistPaymentProof = {
  paymentId: string;
  path: string;
  name: string;
  mimeType: string;
  uploadedAt: string | null;
};

function inferMime(name: string, mime?: string | null): string {
  const explicit = String(mime || '').toLowerCase().trim();
  if (ALLOWED.has(explicit)) return explicit;
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function safeName(name: string, mime: string): string {
  const raw = String(name || 'preuve').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  const fallback = mime === 'application/pdf' ? 'preuve.pdf' : mime === 'image/png' ? 'preuve.png' : mime === 'image/webp' ? 'preuve.webp' : 'preuve.jpg';
  return raw || fallback;
}

async function currentUserId(): Promise<string> {
  if (!supabase) throw new Error('Supabase indisponible.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Compte Loki Music requis.');
  return data.user.id;
}

export async function loadPlaylistPaymentProof(paymentId: string): Promise<PlaylistPaymentProof | null> {
  if (!supabase || !paymentId) return null;
  const { data, error } = await supabase
    .from('playlist_sale_payments')
    .select('id,buyer_payment_proof_path,buyer_payment_proof_name,buyer_payment_proof_mime,buyer_payment_proof_uploaded_at')
    .eq('id', paymentId)
    .maybeSingle();
  if (error) throw error;
  const path = String((data as any)?.buyer_payment_proof_path ?? '').trim();
  if (!path) return null;
  return {
    paymentId: String((data as any)?.id ?? paymentId),
    path,
    name: String((data as any)?.buyer_payment_proof_name ?? 'preuve'),
    mimeType: String((data as any)?.buyer_payment_proof_mime ?? ''),
    uploadedAt: (data as any)?.buyer_payment_proof_uploaded_at ? String((data as any).buyer_payment_proof_uploaded_at) : null,
  };
}

export async function pickAndUploadPlaylistPaymentProof(paymentId: string): Promise<PlaylistPaymentProof | null> {
  if (!supabase) throw new Error('Supabase indisponible.');
  const userId = await currentUserId();

  const picked = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const asset = picked.assets[0];
  if (asset.size != null && asset.size > MAX_BYTES) throw new Error('La preuve doit faire moins de 10 Mo.');

  const mime = inferMime(asset.name || '', asset.mimeType);
  if (!ALLOWED.has(mime)) throw new Error('Utilise une capture JPG/PNG/WEBP ou un PDF.');

  const name = safeName(asset.name || '', mime);
  const path = `${userId}/${paymentId}/${Date.now()}-${name}`;

  const response = await fetch(asset.uri);
  if (!response.ok && !asset.uri.startsWith('file:') && !asset.uri.startsWith('content:') && !asset.uri.startsWith('blob:')) {
    throw new Error('Impossible de lire cette preuve.');
  }
  const blob = await response.blob();
  if (blob.size > MAX_BYTES) throw new Error('La preuve doit faire moins de 10 Mo.');

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: false,
    contentType: mime,
    cacheControl: '300',
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc('keep_playlist_sale_attach_payment_proof', {
    p_payment_id: paymentId,
    p_storage_path: path,
    p_file_name: name,
    p_mime_type: mime,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }

  const row = data as any;
  return {
    paymentId: String(row?.paymentId ?? paymentId),
    path: String(row?.proofPath ?? path),
    name: String(row?.proofName ?? name),
    mimeType: String(row?.proofMime ?? mime),
    uploadedAt: row?.proofUploadedAt ? String(row.proofUploadedAt) : new Date().toISOString(),
  };
}

export async function openPlaylistPaymentProof(paymentId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase indisponible.');
  const proof = await loadPlaylistPaymentProof(paymentId);
  if (!proof) throw new Error('Aucune preuve de paiement jointe.');

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(proof.path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error('Impossible d’ouvrir la preuve.');
  return data.signedUrl;
}
