// @ts-nocheck
import fs from 'fs';
import path from 'path';

const panel = fs.readFileSync(
  path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Loki chat composer comfort contract', () => {
  it('keeps the validated mobile composer slightly taller for comfortable typing', () => {
    expect(panel).toContain("composerBar:{flexDirection:'row',alignItems:'center',gap:7,minHeight:66");
    expect(panel).toContain("inputCompact:{height:56,minHeight:56,maxHeight:112");
  });
});
