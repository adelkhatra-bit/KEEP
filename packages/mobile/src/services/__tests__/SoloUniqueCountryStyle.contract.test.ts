import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations',
    '20261013235000_solo_unique_country_style_variety.sql'),
  'utf8',
);

describe('Solo: exactly one answer and three non-repeating plausible alternatives', () => {
  test('deduplicates artist identities across accents, punctuation and whitespace', () => {
    expect(migration).toContain("regexp_replace(translate(lower(trim(p.artist))");
    expect(migration).toContain("partition by regexp_replace(translate(lower(trim(p.artist))");
    expect(migration).toContain('d.normalized_artist<>p.normalized_artist');
    expect(migration).toContain('count(distinct regexp_replace(translate(lower(trim(choice.value))');
    expect(migration).toContain("jsonb_array_length(x.choices)=4");
    expect(migration).toContain('x.normalized_artist)=1');
  });

  test('locks country-local styles to authentic artist countries', () => {
    for (const [theme, country] of [
      ['CHANSON_FR','FR'],['RAP_FR','FR'],['RAP_US','US'],
      ['JPOP','JP'],['KPOP','KR'],['EGYPTIAN_POP','EG'],
    ]) {
      expect(migration).toContain("when '" + theme + "' then '" + country + "'");
    }
    expect(migration).toContain('country_code=v_theme_country');
    expect(migration).toContain('d.country_code is not distinct from p.country_code');
    expect(migration).toContain("p.theme_code='MIX' or d.theme_code=p.theme_code");
    expect(migration).toContain("hip.hop|rap|arabic|arabe|k.pop");
  });

  test('increases unique available artists and alternates countries during MIX', () => {
    expect(migration).toContain('tablesample system (16)');
    expect(migration).toContain('limit 2400');
    expect(migration).toContain('limit 2800');
    expect(migration).toContain('row_number() over(partition by d.country_code');
    expect(migration).toContain('case when v_themes is null then country_rank else 0 end');
    expect(migration).toContain('and (v_themes is not null or country_code is not null)');
  });

  test('never changes quota charges, game scores, permissions or remembers wrong players', () => {
    expect(migration).toContain("'stakeFree',0,'rewardFree',0");
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('keep_battle_remember_content');
    expect(migration).toContain('BATTLE_THEME_CATALOG_TOO_SMALL:');
  });

  test('curated origin mapping adds Korean, Japanese, French and Arabic artists without inferring nationality', () => {
    expect(migration).toContain("('뉴진스','KR')");
    expect(migration).toContain("('藤井 風','JP')");
    expect(migration).toContain("('françoise hardy','FR')");
    expect(migration).toContain("('fairouz','LB')");
    expect(migration).toContain("('trippie redd','US')");
    expect(migration).toContain('on conflict(artist_key) do nothing');
  });
});
