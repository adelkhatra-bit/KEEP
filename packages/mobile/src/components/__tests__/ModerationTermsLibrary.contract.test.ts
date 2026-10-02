import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : une bibliothèque unique de mots interdits (insultes,
// haine, drogue…) pour La Place, les messages privés et les groupes. Les mots
// d'un message signalé partent au Super Admin, qui les interdit ou les refuse.
const root = path.join(__dirname, '..', '..', '..', '..', '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261003001500_moderation_terms_library.sql'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'packages', 'admin', 'pages', 'community.tsx'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8');

describe('moderation terms library', () => {
  it('the single chat filter reads the library (ACTIVE terms, whole words)', () => {
    expect(migration).toContain('create or replace function public.keep_agora_contains_blocked_language(p_body text)');
    expect(migration).toContain("where t.status = 'ACTIVE'");
    expect(migration).toContain("position(' ' || t.normalized || ' ' in v) > 0");
  });

  it('normalises accents and common bypasses without the unaccent extension', () => {
    expect(migration).not.toMatch(/unaccent\(/);
    expect(migration).toContain("'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ013457@$'");
  });

  it('seeds drugs as expressions, never the ambiguous single words', () => {
    expect(migration).toContain("('fais tourner le joint','DROGUE')");
    expect(migration).not.toContain("('joint','DROGUE')");
    expect(migration).not.toContain("('héroïne','DROGUE')");
  });

  it('every report proposes its unknown words to the Super Admin', () => {
    expect(migration).toContain('create trigger user_reports_propose_moderation_terms');
    expect(migration).toContain("'PENDING', 'REPORT'");
    expect(migration).toContain('where public.moderation_terms.status = \'PENDING\'');
  });

  it('decisions are reserved to active admins', () => {
    for (const fn of ['admin_moderation_terms', 'admin_moderation_decide_term', 'admin_moderation_add_term']) {
      const body = migration.slice(migration.indexOf(`function public.${fn}(`));
      expect(body).toContain("a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')");
    }
    expect(migration).toContain('revoke all on public.moderation_terms from anon, authenticated;');
  });

  it('is additive only (no user content dropped or deleted)', () => {
    expect(migration).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
  });

  it('the Super Admin can approve, refuse and add terms', () => {
    expect(admin).toContain("supabase.rpc('admin_moderation_terms',{p_status:'PENDING'");
    expect(admin).toContain("supabase.rpc('admin_moderation_decide_term'");
    expect(admin).toContain("supabase.rpc('admin_moderation_add_term'");
    expect(admin).toContain('<ModerationLibrary />');
  });

  it('the sender gets a clear refusal message', () => {
    expect(panel).toContain('il contient un mot interdit sur KEEP');
  });
});
