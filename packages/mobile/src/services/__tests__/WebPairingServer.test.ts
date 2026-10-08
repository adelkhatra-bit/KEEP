// @ts-nocheck
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { webcrypto } from 'crypto';

const edgeSource = fs.readFileSync(path.resolve(__dirname, '../../../../../supabase/functions/keep-web-pairing/index.ts'), 'utf8');

async function backend() {
  const proof = 'fixture-pairing-proof';
  const tokenHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(proof))).toString('hex');
  const owner = { id: 'owner', email: 'owner@example.test', email_confirmed_at: '2026-01-01', is_anonymous: false };
  const pairing = { id: 'pairing', token_hash: tokenHash, status: 'WAITING', device_label: 'PC', expires_at: new Date(Date.now() + 60000).toISOString() };
  const tables = { web_pairings: [pairing], web_companion_sessions: [], email_delivery_events: [] };
  let user = owner;
  let handler;
  const sent = jest.fn().mockResolvedValue({ ok: true, provider: 'brevo' });
  const generateLink = jest.fn().mockResolvedValue({ data: { properties: { action_link: 'https://auth.example.test/one-time-link' } } });

  function query(table) {
    const filters = [];
    let operation = 'read';
    let values;
    let singular = false;
    const q = {
      select: () => q, order: () => q, limit: () => q,
      eq: (key, value) => { filters.push((row) => row[key] === value); return q; },
      gt: (key, value) => { filters.push((row) => row[key] > value); return q; },
      in: (key, value) => { filters.push((row) => value.includes(row[key])); return q; },
      is: (key, value) => { filters.push((row) => (row[key] ?? null) === value); return q; },
      insert: (value) => { operation = 'insert'; values = value; return q; },
      update: (value) => { operation = 'update'; values = value; return q; },
      maybeSingle: () => { singular = true; return q; },
      single: () => { singular = true; return q; },
      then: (resolve, reject) => {
        const rows = tables[table];
        let matching = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === 'insert') {
          if (rows.some((row) => values.event_fingerprint && row.event_fingerprint === values.event_fingerprint
            || values.pairing_id && row.pairing_id === values.pairing_id)) {
            return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve, reject);
          }
          const row = { id: 'fixture-id', created_at: new Date().toISOString(), revoked_at: null, ...values };
          rows.push(row);
          matching = [row];
        }
        if (operation === 'update') matching.forEach((row) => Object.assign(row, values));
        return Promise.resolve({ data: singular ? matching[0] ?? null : matching, error: null }).then(resolve, reject);
      },
    };
    return q;
  }
  const admin = {
    from: query,
    auth: { getUser: jest.fn(async () => ({ data: { user }, error: null })), admin: { generateLink } },
  };
  const modules = {
    'jsr:@supabase/functions-js/edge-runtime.d.ts': {},
    'npm:@supabase/supabase-js@2': { createClient: () => admin },
    '../_shared/lokiEmailSend.ts': { sendTransactionalEmail: sent },
    '../_shared/lokiEmailShell.ts': { lokiEmailCtaShell: (_title, _heading, intro, _label, link, footer) => `${intro} ${link} ${footer}` },
  };
  const compiled = ts.transpileModule(edgeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, {
    exports: {}, require: (name) => modules[name], Deno: { env: { get: () => '' }, serve: (fn) => { handler = fn; } },
    crypto: webcrypto, TextEncoder, Response, Date, console: { error: jest.fn() },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'), btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  });
  const jwt = `fixture.${Buffer.from(JSON.stringify({ session_id: 'auth-session' })).toString('base64url')}.fixture`;
  const call = async (action, body = {}) => {
    const headers = new Headers();
    headers.set('authorization', 'Bearer ' + jwt);
    const req = new Request('https://edge.example.test', { method: 'POST', headers, body: JSON.stringify({ action, pairingId: 'pairing', token: proof, ...body }) });
    const response = await handler(req);
    return { status: response.status, body: await response.json() };
  };
  return { call, tables, pairing, sent, generateLink, setUser: (value) => { user = value; }, owner };
}

describe('keep-web-pairing server security', () => {
  it('emails only the fixed public QR URL to the authenticated verified address, never a login proof', async () => {
    const b = await backend();
    expect((await b.call('email-link', { email: 'attacker@example.test' })).status).toBe(200);
    expect(b.sent).toHaveBeenCalledTimes(1);
    const args = b.sent.mock.calls[0];
    expect(args[0]).toBe(b.owner.email);
    expect(args[2]).toContain('https://adelkhatra-bit.github.io/KEEP/');
    expect(args.join(' ')).not.toMatch(/token=|pairing_id=|one-time-link|fixture-pairing-proof/);
    expect(b.generateLink).not.toHaveBeenCalled();
    expect(b.tables.web_pairings).toHaveLength(1);
    expect(b.pairing.status).toBe('WAITING');
    expect((await b.call('email-link')).status).toBe(429);
  });

  it('requires a verified permanent account for email and approval', async () => {
    const b = await backend();
    b.setUser({ ...b.owner, email_confirmed_at: null });
    expect((await b.call('email-link')).status).toBe(409);
    expect((await b.call('approve', { confirmed: true })).status).toBe(409);
    b.setUser({ ...b.owner, is_anonymous: true });
    expect((await b.call('approve', { confirmed: true })).status).toBe(401);
    expect(b.generateLink).not.toHaveBeenCalled();
  });

  it('inspection never authenticates the browser; explicit confirmation and a valid QR are required', async () => {
    const b = await backend();
    expect((await b.call('inspect')).body.deviceLabel).toBe('PC');
    expect((await b.call('claim')).body.status).toBe('WAITING');
    expect((await b.call('approve')).status).toBe(400);
    expect((await b.call('approve', { confirmed: true, token: 'wrong-proof' })).status).toBe(404);
    expect(b.generateLink).not.toHaveBeenCalled();
    expect((await b.call('approve', { confirmed: true })).status).toBe(200);
    expect((await b.call('claim')).body.actionLink).toBe('https://auth.example.test/one-time-link');
  });

  it('expiry and refusal prevent approval and browser claim', async () => {
    const b = await backend();
    b.pairing.expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await b.call('approve', { confirmed: true })).status).toBe(409);
    expect((await b.call('claim')).status).toBe(410);
    const refused = await backend();
    expect((await refused.call('cancel')).status).toBe(200);
    expect((await refused.call('approve', { confirmed: true })).status).toBe(409);
    expect((await refused.call('claim')).status).toBe(410);
  });

  it('register is owner-bound, idempotent, and cannot resurrect a revoked session', async () => {
    const b = await backend();
    await b.call('approve', { confirmed: true });
    b.setUser({ ...b.owner, id: 'stranger' });
    expect((await b.call('register')).status).toBe(403);
    b.setUser(b.owner);
    const registration = await b.call('register');
    expect(registration.status).toBe(200);
    expect((await b.call('register')).status).toBe(200);
    expect(b.tables.web_companion_sessions).toHaveLength(1);
    expect((await b.call('revoke', { sessionId: registration.body.session.id })).body.revoked).toBe(true);
    expect((await b.call('status', { sessionId: registration.body.session.id })).body.revoked).toBe(true);
    expect((await b.call('register')).status).toBe(409);
    expect((await b.call('claim')).status).toBe(410);
    expect((await b.call('list')).body.sessions).toEqual([]);
    expect(b.tables.web_companion_sessions[0].revoked_at).toBeTruthy();
  });

  it('a stranger cannot list or revoke another owner’s computer', async () => {
    const b = await backend();
    await b.call('approve', { confirmed: true });
    await b.call('register');
    b.setUser({ ...b.owner, id: 'stranger' });
    expect((await b.call('list')).body.sessions).toEqual([]);
    expect((await b.call('revoke', { sessionId: 'fixture-id' })).body.revoked).toBe(false);
    expect(b.tables.web_companion_sessions[0].revoked_at).toBeNull();
  });
});
