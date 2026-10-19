import fs from 'fs';
import path from 'path';

describe('Story source attribution layout', () => {
  const deck = fs.readFileSync(path.join(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

  it('uses one compact @username + Voir control in the header for desktop and mobile', () => {
    expect(deck).toContain('testID="deck-source-profile-inline"');
    expect(deck).toContain('sourceProfileInlineName');
    expect(deck).toContain('sourceProfileInlineAction');
    expect(deck).toContain('Voir ›</Text>');
    expect(deck).toContain('onOpenSourceProfile(currentSourceUsername.replace');
  });

  it('does not render the oversized attribution button over the Swipe controls or cover', () => {
    expect(deck).not.toContain('sourceProfileButtonText');
    expect(deck).not.toContain('sourceOverlayText');
    expect(deck).not.toContain('DÉCOUVERT PAR @{currentSourceUsername.replace(/^@/, \'\')} · VOIR / SUIVRE');
  });
});
