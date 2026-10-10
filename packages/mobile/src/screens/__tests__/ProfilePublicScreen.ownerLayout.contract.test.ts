// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('ProfilePublicScreen owner layout contract', () => {
  const source = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('keeps FREE immediately after Reprises in the owner metrics bar', () => {
    const bar = source.indexOf('<View style={s.topMetricsBar}');
    const group = source.indexOf('<View style={s.topMetricSocialGroup}>', bar);
    const groupEnd = source.indexOf('</View>\n      </View>', group);
    const slice = source.slice(group, groupEnd);

    const followers = slice.indexOf('>Abonnés</Text>');
    const reprises = slice.indexOf('>Reprises</Text>');
    const free = slice.indexOf('>FREE</Text>');

    expect(bar).toBeGreaterThan(-1);
    expect(group).toBeGreaterThan(bar);
    expect(followers).toBeGreaterThan(-1);
    expect(reprises).toBeGreaterThan(followers);
    expect(free).toBeGreaterThan(reprises);
    expect(slice).toContain('s.topMetricFreeItem');
  });

  it('never renders FREE beside the profile kind badge', () => {
    const meta = source.indexOf('<View style={s.profileMetaBadgeGroup}>');
    const metaEnd = source.indexOf('</View>', meta);
    expect(meta).toBeGreaterThan(-1);
    expect(source.slice(meta, metaEnd)).not.toContain('>FREE</Text>');
    expect(source).not.toContain('profileFreeInline');
  });

  it('locks the same rule in the canonical product contract', () => {
    expect(contract.profileOwner.freePlacement).toBe('immediately-after-Reprises-in-owner-metrics-bar');
    expect(contract.profileOwner.metricsBarOrder).toEqual(['PLUS', 'Abonnés', 'Reprises', 'FREE']);
    expect(contract.profileOwner.freeBesideProfileKind).toBe(false);
    expect(contract.profileOwner.freeImmediatelyAfterReprises).toBe(true);
    expect(contract.profileOwner.freeMustAppearExactlyOnce).toBe(true);
  });
  it('keeps every profile-kind choice visibly blue instead of black', () => {
    expect(source).toContain("borderColor:colors.info");
    expect(source).toContain("backgroundColor:'rgba(92,168,252,.08)'");
    expect(source).toContain("kindChoiceOn:{backgroundColor:colors.info");
    expect(contract.profileOwner.profileKindPicker.allChoicesMustHaveBlueOutline).toBe(true);
    expect(contract.profileOwner.profileKindPicker.inactiveBorderColorToken).toBe('info');
    expect(contract.profileOwner.profileKindPicker.inactiveBackgroundMayNotBeBlack).toBe(true);
  });

});
