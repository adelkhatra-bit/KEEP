// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('runtime internationalization contract', () => {
  const i18n = read(__dirname, '..', '..', 'i18n', 'index.ts');
  const edge = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-ui-translate', 'index.ts');

  it('keeps French and English bundled for immediate offline startup', () => {
    expect(i18n).toContain("fr: { translation: fr }");
    expect(i18n).toContain("en: { translation: en }");
  });

  it('detects the device locale and asks the server for non-bundled packs', () => {
    expect(i18n).toContain('Localization.getLocales');
    expect(i18n).toContain("supabase.functions.invoke('keep-ui-translate'");
    expect(i18n).toContain('activateRuntimeLanguage');
  });

  it('never ships the translation provider key in the mobile bundle', () => {
    expect(i18n).not.toContain('GOOGLE_TRANSLATE_API_KEY');
    expect(edge).toContain('GOOGLE_TRANSLATE_API_KEY');
    expect(edge).toContain('service_get_integration_secret');
  });

  it('protects interpolation variables and caches translations server-side', () => {
    expect(edge).toContain('__LOKI_VAR_');
    expect(edge).toContain('ui_translation_cache');
    expect(edge).toContain('source_hash');
  });
});
