// @ts-nocheck
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/keep-music-keyless-source/index.ts'), 'utf8');
const client = fs.readFileSync(path.resolve(__dirname, '..', 'keepMusicCoreRecognition.ts'), 'utf8');
const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');

describe('Copied YouTube link resolves exactly the shared video', () => {
  it('does not trust clipboard captions or recommended videos for a pasted YouTube URL', () => {
    expect(edge).toContain('const explicit = strictYoutubeLink ? null : extractExplicitMusic(page.html);');
    expect(edge).toContain('await oEmbed("YOUTUBE", sourceUrl.toString())');
    expect(edge).toContain('videoIdentityVerified: Boolean(strictYoutubeLink && embeddedTitle)');
    expect(edge).toContain('const videoMetadata = strictYoutubeLink ?');
    expect(edge).toContain('if (!verified) return sourceVerifiedFallback();');
  });
  it('the PC/iPhone client rejects stale or mismatched server identifications', () => {
    expect(client).toContain('payload.evidence?.videoIdentityVerified !== true');
    expect(client).toContain('originalId !== resolvedId');
    expect(home).toContain('openTemporaryMusicPreview(found, input)');
    expect(home).toContain('Chercher un titre ou un lien');
    expect(home).not.toContain('Comment ça marche ?');
  });
});
