import fs from 'fs';
import path from 'path';

describe('PlaylistSaleImmersivePreview web animation contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'PlaylistSaleImmersivePreview.tsx'), 'utf8');

  it('never requests the unavailable native animation driver on web', () => {
    expect(source).toContain("Platform.OS !== 'web'");
    expect(source).not.toContain('useNativeDriver: true');
  });
});
