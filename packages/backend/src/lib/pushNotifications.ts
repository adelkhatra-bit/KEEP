/**
 * Livraison push Expo avec cycle de vie production :
 * CREATED -> NO_DEVICE | SENT -> DELIVERED | FAILED.
 *
 * Les tickets Expo confirment uniquement l'acceptation du message. Les reçus
 * Expo sont donc relus séparément avant de considérer une notification livrée.
 * Les tokens DeviceNotRegistered sont supprimés immédiatement pour éviter les
 * envois inutiles suivants.
 */
import { getSupabaseAdminClient } from './supabaseAdmin';

interface PendingNotification {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  push_attempt_count?: number | null;
}

interface PushTokenRow {
  id: string;
  token: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface SentAttemptRow {
  id: string;
  notification_id: string;
  push_token_id: string | null;
  expo_ticket_id: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_TOKEN_PATTERN = /^(?:Exponent|Expo)PushToken\[.+\]$/;
const MAX_TRANSPORT_ATTEMPTS = 3;
const RECEIPT_BATCH_SIZE = 300;

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 500);
  return String(value ?? 'Erreur push inconnue').slice(0, 500);
}

function tokenSuffix(token: string): string {
  return token.slice(-12);
}

async function sendExpoPush(
  rows: PushTokenRow[],
  title: string,
  body: string,
  data: Record<string, unknown> | null,
): Promise<ExpoPushTicket[]> {
  const messages = rows.map(({ token: to }) => ({
    to,
    title,
    body,
    data: data ?? {},
    sound: 'default',
    priority: 'high',
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Expo Push API HTTP ${response.status}`);

  const payload = (await response.json()) as { data?: ExpoPushTicket[] };
  const tickets = payload.data ?? [];
  if (tickets.length !== rows.length) {
    throw new Error(`Expo Push API: ${tickets.length} tickets pour ${rows.length} messages`);
  }
  return tickets;
}

async function fetchExpoReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
  if (ticketIds.length === 0) return {};
  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids: ticketIds }),
  });
  if (!response.ok) throw new Error(`Expo Push receipts HTTP ${response.status}`);
  const payload = (await response.json()) as { data?: Record<string, ExpoPushReceipt> };
  return payload.data ?? {};
}

async function saveAttempt(
  client: any,
  notification: PendingNotification,
  tokenRow: PushTokenRow | null,
  values: Record<string, unknown>,
): Promise<void> {
  if (!tokenRow) {
    const { error } = await client.from('push_delivery_attempts').insert({
      notification_id: notification.id,
      profile_id: notification.profile_id,
      push_token_id: null,
      token_suffix: null,
      ...values,
    });
    // Une notification NO_DEVICE déjà enregistrée n'est pas une panne du worker.
    if (error && error.code !== '23505') throw error;
    return;
  }

  const now = new Date().toISOString();
  const updatePayload = {
    profile_id: notification.profile_id,
    token_suffix: tokenSuffix(tokenRow.token),
    last_attempt_at: now,
    updated_at: now,
    ...values,
  };
  const { data: existing, error: updateError } = await client
    .from('push_delivery_attempts')
    .update(updatePayload)
    .eq('notification_id', notification.id)
    .eq('push_token_id', tokenRow.id)
    .select('id');
  if (updateError) throw updateError;
  if ((existing ?? []).length > 0) return;

  const { error: insertError } = await client.from('push_delivery_attempts').insert({
    notification_id: notification.id,
    profile_id: notification.profile_id,
    push_token_id: tokenRow.id,
    token_suffix: tokenSuffix(tokenRow.token),
    ...values,
  });
  if (insertError && insertError.code !== '23505') throw insertError;
}

async function removeDeadToken(client: any, tokenRow: PushTokenRow | null): Promise<void> {
  if (!tokenRow) return;
  await client.from('push_tokens').delete().eq('id', tokenRow.id);
}

async function refreshNotificationSummary(client: any, notificationId: string): Promise<void> {
  const { data: rows, error } = await client
    .from('push_delivery_attempts')
    .select('status')
    .eq('notification_id', notificationId);
  if (error) throw error;
  const statuses = (rows ?? []).map((row: { status: string }) => row.status);
  if (statuses.length === 0) return;

  let status = 'FAILED';
  if (statuses.includes('DELIVERED')) status = 'DELIVERED';
  else if (statuses.includes('SENT')) status = 'SENT';
  else if (statuses.includes('NO_DEVICE')) status = 'NO_DEVICE';

  const patch: Record<string, unknown> = { push_delivery_status: status };
  if (status === 'DELIVERED') patch.push_delivered_at = new Date().toISOString();
  await client.from('notifications').update(patch).eq('id', notificationId);
}

/**
 * Envoie les notifications encore CREATED. Une panne réseau est retentée au
 * prochain cycle, au maximum trois fois. Les erreurs définitives renvoyées dans
 * un ticket Expo sont conservées et ne bouclent pas indéfiniment.
 */
export async function processPendingPushNotifications(): Promise<{ processed: number; sent: number; noDevice: number; errors: number }> {
  const client = getSupabaseAdminClient();
  if (!client) return { processed: 0, sent: 0, noDevice: 0, errors: 0 };

  const { data: pending, error: pendingError } = await client
    .from('notifications')
    .select('id, profile_id, title, body, data, push_attempt_count')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(50);
  if (pendingError || !pending || pending.length === 0) {
    return { processed: 0, sent: 0, noDevice: 0, errors: pendingError ? 1 : 0 };
  }

  let sent = 0;
  let noDevice = 0;
  let errors = 0;

  for (const notification of pending as PendingNotification[]) {
    const previousAttempts = Number(notification.push_attempt_count ?? 0);
    const attemptNumber = previousAttempts + 1;
    try {
      const { data: rawTokenRows, error: tokenError } = await client
        .from('push_tokens')
        .select('id, token')
        .eq('profile_id', notification.profile_id);
      if (tokenError) throw tokenError;

      const allRows = (rawTokenRows ?? []) as PushTokenRow[];
      const validRows = allRows.filter((row) => EXPO_TOKEN_PATTERN.test(row.token));
      const invalidRows = allRows.filter((row) => !EXPO_TOKEN_PATTERN.test(row.token));
      for (const invalid of invalidRows) await removeDeadToken(client, invalid);

      const now = new Date().toISOString();
      if (validRows.length === 0) {
        await saveAttempt(client, notification, null, {
          status: 'NO_DEVICE',
          attempt_count: attemptNumber,
          last_attempt_at: now,
          last_error_code: 'NO_DEVICE',
          last_error_message: 'Aucun token Expo valide enregistré pour ce profil.',
          updated_at: now,
        });
        await client.from('notifications').update({
          pushed_at: now,
          push_delivery_status: 'NO_DEVICE',
          push_attempt_count: attemptNumber,
          push_last_error: 'Aucun appareil push enregistré.',
        }).eq('id', notification.id);
        noDevice += 1;
        continue;
      }

      const tickets = await sendExpoPush(validRows, notification.title, notification.body ?? '', notification.data);
      let accepted = 0;
      let firstError: string | null = null;

      for (let i = 0; i < validRows.length; i += 1) {
        const tokenRow = validRows[i];
        const ticket = tickets[i];
        if (ticket.status === 'ok' && ticket.id) {
          accepted += 1;
          await saveAttempt(client, notification, tokenRow, {
            status: 'SENT',
            expo_ticket_id: ticket.id,
            attempt_count: attemptNumber,
            last_attempt_at: now,
            receipt_checked_at: null,
            delivered_at: null,
            last_error_code: null,
            last_error_message: null,
            updated_at: now,
          });
          continue;
        }

        const code = ticket.details?.error ?? 'EXPO_TICKET_ERROR';
        const message = ticket.message ?? code;
        firstError ??= message;
        await saveAttempt(client, notification, tokenRow, {
          status: 'FAILED',
          attempt_count: attemptNumber,
          last_attempt_at: now,
          receipt_checked_at: now,
          last_error_code: code,
          last_error_message: message.slice(0, 500),
          updated_at: now,
        });
        if (code === 'DeviceNotRegistered') await removeDeadToken(client, tokenRow);
      }

      await client.from('notifications').update({
        pushed_at: now,
        push_delivery_status: accepted > 0 ? 'SENT' : 'FAILED',
        push_attempt_count: attemptNumber,
        push_last_error: firstError,
      }).eq('id', notification.id);
      if (accepted > 0) sent += 1;
      else errors += 1;
    } catch (error) {
      errors += 1;
      const message = errorMessage(error);
      const terminal = attemptNumber >= MAX_TRANSPORT_ATTEMPTS;
      const patch: Record<string, unknown> = {
        push_attempt_count: attemptNumber,
        push_last_error: message,
        push_delivery_status: terminal ? 'FAILED' : 'CREATED',
      };
      if (terminal) patch.pushed_at = new Date().toISOString();
      await client.from('notifications').update(patch).eq('id', notification.id);
      console.warn('[KEEP][push] transport échoué', notification.id, message, `tentative ${attemptNumber}/${MAX_TRANSPORT_ATTEMPTS}`);
    }
  }

  return { processed: pending.length, sent, noDevice, errors };
}

/**
 * Relit les reçus Expo des tickets SENT. Un reçu absent reste SENT et sera
 * revérifié plus tard. DeviceNotRegistered invalide le token concerné.
 */
export async function processExpoPushReceipts(): Promise<{ checked: number; delivered: number; failed: number; errors: number }> {
  const client = getSupabaseAdminClient();
  if (!client) return { checked: 0, delivered: 0, failed: 0, errors: 0 };

  const { data: rows, error: rowsError } = await client
    .from('push_delivery_attempts')
    .select('id, notification_id, push_token_id, expo_ticket_id')
    .eq('status', 'SENT')
    .not('expo_ticket_id', 'is', null)
    .order('last_attempt_at', { ascending: true })
    .limit(RECEIPT_BATCH_SIZE);
  if (rowsError || !rows || rows.length === 0) {
    return { checked: 0, delivered: 0, failed: 0, errors: rowsError ? 1 : 0 };
  }

  const attempts = (rows as SentAttemptRow[]).filter((row) => Boolean(row.expo_ticket_id));
  try {
    const receipts = await fetchExpoReceipts(attempts.map((row) => row.expo_ticket_id));
    const affectedNotifications = new Set<string>();
    let checked = 0;
    let delivered = 0;
    let failed = 0;
    const now = new Date().toISOString();

    for (const attempt of attempts) {
      const receipt = receipts[attempt.expo_ticket_id];
      // Expo peut ne pas avoir généré le reçu immédiatement : ne pas le marquer
      // comme échec et le laisser au prochain cycle.
      if (!receipt) continue;
      checked += 1;
      affectedNotifications.add(attempt.notification_id);

      if (receipt.status === 'ok') {
        delivered += 1;
        await client.from('push_delivery_attempts').update({
          status: 'DELIVERED',
          receipt_checked_at: now,
          delivered_at: now,
          last_error_code: null,
          last_error_message: null,
          updated_at: now,
        }).eq('id', attempt.id);
        continue;
      }

      failed += 1;
      const code = receipt.details?.error ?? 'EXPO_RECEIPT_ERROR';
      const message = receipt.message ?? code;
      await client.from('push_delivery_attempts').update({
        status: 'FAILED',
        receipt_checked_at: now,
        last_error_code: code,
        last_error_message: message.slice(0, 500),
        updated_at: now,
      }).eq('id', attempt.id);
      if (code === 'DeviceNotRegistered' && attempt.push_token_id) {
        await client.from('push_tokens').delete().eq('id', attempt.push_token_id);
      }
    }

    for (const notificationId of affectedNotifications) {
      await refreshNotificationSummary(client, notificationId);
    }
    return { checked, delivered, failed, errors: 0 };
  } catch (error) {
    console.warn('[KEEP][push] lecture receipts échouée:', errorMessage(error));
    return { checked: 0, delivered: 0, failed: 0, errors: 1 };
  }
}
