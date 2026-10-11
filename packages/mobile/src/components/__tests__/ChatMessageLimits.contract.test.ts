// @ts-nocheck
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261002006000_chat_message_limit_alignment.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Loki Messenger message limits contract', () => {
  it('keeps the database body constraint aligned with the 2000-char mobile composer', () => {
    expect(migration).toContain('check (char_length(body) between 1 and 2000)');
    expect(migration).toContain('char_length(v_body)>2000');
  });

  it('does not block a normal direct thread after three unanswered messages', () => {
    expect(migration).not.toContain('direct_reply_required');
    expect(migration).not.toContain('v_unanswered_count');
  });

  it('keeps frequency anti-spam protections', () => {
    expect(migration).toContain("interval '1 minute')>=4");
    expect(migration).toContain("interval '1 hour')>=30");
  });
});
