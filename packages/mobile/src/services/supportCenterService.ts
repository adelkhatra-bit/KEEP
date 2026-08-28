import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

export type SupportCategory = 'TECHNICAL' | 'ACCOUNT' | 'RECOGNITION' | 'PAYMENT' | 'SAFETY' | 'IDEA' | 'OTHER';
export type SupportStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';

export type SupportTicket = {
  id: string;
  profileId: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  appContext: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  senderProfileId?: string | null;
  senderRole: 'USER' | 'ADMIN' | 'SYSTEM';
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function requireSupabase() {
  if (!supabase) throw new Error('KEEP n’est pas connecté au serveur.');
  return supabase;
}

function appContext(extra: Record<string, unknown> = {}) {
  const context: Record<string, unknown> = {
    platform: Platform.OS,
    capturedAt: new Date().toISOString(),
    ...extra,
  };
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    context.userAgent = navigator.userAgent.slice(0, 500);
    context.language = navigator.language;
  }
  return context;
}

function mapTicket(row: any): SupportTicket {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    category: row.category as SupportCategory,
    subject: String(row.subject ?? ''),
    status: row.status as SupportStatus,
    priority: row.priority,
    appContext: row.app_context && typeof row.app_context === 'object' ? row.app_context : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastMessageAt: String(row.last_message_at),
  };
}

function mapMessage(row: any): SupportMessage {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    senderProfileId: row.sender_profile_id ? String(row.sender_profile_id) : null,
    senderRole: row.sender_role,
    body: String(row.body ?? ''),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: String(row.created_at),
  };
}

export async function loadOwnSupportTickets(): Promise<SupportTicket[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('support_tickets')
    .select('id,profile_id,category,subject,status,priority,app_context,created_at,updated_at,last_message_at')
    .order('last_message_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTicket);
}

export async function loadSupportMessages(ticketId: string): Promise<SupportMessage[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('support_ticket_messages')
    .select('id,ticket_id,sender_profile_id,sender_role,body,metadata,created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

export async function createSupportTicket(input: {
  profileId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  username?: string;
  context?: Record<string, unknown>;
}): Promise<SupportTicket> {
  const client = requireSupabase();
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (subject.length < 3) throw new Error('Ajoute un objet plus précis.');
  if (!message) throw new Error('Décris le problème ou ta demande.');

  const { data: created, error: ticketError } = await client
    .from('support_tickets')
    .insert({
      profile_id: input.profileId,
      category: input.category,
      subject,
      app_context: appContext({ username: input.username ?? null, ...(input.context ?? {}) }),
    })
    .select('id,profile_id,category,subject,status,priority,app_context,created_at,updated_at,last_message_at')
    .single();
  if (ticketError) throw ticketError;

  const { error: messageError } = await client.from('support_ticket_messages').insert({
    ticket_id: created.id,
    sender_profile_id: input.profileId,
    sender_role: 'USER',
    body: message,
    metadata: appContext(),
  });
  if (messageError) throw messageError;
  return mapTicket(created);
}

export async function replyToSupportTicket(profileId: string, ticketId: string, body: string): Promise<void> {
  const client = requireSupabase();
  const clean = body.trim();
  if (!clean) return;
  const { error } = await client.from('support_ticket_messages').insert({
    ticket_id: ticketId,
    sender_profile_id: profileId,
    sender_role: 'USER',
    body: clean,
    metadata: appContext(),
  });
  if (error) throw error;
}

export function subscribeOwnSupport(profileId: string, onChange: () => void) {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel(`support:${profileId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `profile_id=eq.${profileId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}