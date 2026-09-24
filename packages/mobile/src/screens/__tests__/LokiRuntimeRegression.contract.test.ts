// @ts-nocheck
import fs from 'fs';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '..', '..', '..');
const repoRoot = path.resolve(mobileRoot, '..', '..');
const readMobile = (p: string) => fs.readFileSync(path.join(mobileRoot, p), 'utf8');
const readRepo = (p: string) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

describe('Loki runtime regression contract — mic, popups, push money sound', () => {
  it('stops the listening session when microphone permission is genuinely blocked', () => {
    const store = readMobile('src/store/useSessionStore.ts');
    const capture = readMobile('src/services/micCapture.ts');
    expect(store).toContain('e instanceof MicPermissionDeniedError');
    expect(store).toContain('get().requestEndSession();');
    expect(store).toContain("Alert.alert('Microphone bloqué'");
    expect(capture).toContain('cancellationVersion += 1;');
    expect(capture).toContain('await stopRecordingQuietly(recording);');
    expect(capture).toContain('await setNativeRecordingMode(false);');
    expect(capture).toContain('releaseCaptureResources();');
  });

  it('uses the Loki alert layer for playlist-sale confirmations', () => {
    const panel = readMobile('src/components/PlaylistSalePanel.tsx');
    const alertHost = readMobile('src/components/AlertHost.tsx');
    expect(panel).toContain("import { Alert } from '../utils/keepAlert';");
    expect(panel).not.toContain('ActivityIndicator, Alert, FlatList');
    expect(alertHost).toContain('borderColor: colors.primary');
    expect(alertHost).toContain('backgroundColor: colors.backgroundElevated');
  });

  it('bundles and routes a real custom coin sound for incoming money', () => {
    const app = readMobile('app.json');
    const push = readMobile('src/services/pushNotificationService.ts');
    const worker = readRepo('supabase/functions/keep-push-worker/index.ts');
    const generator = readMobile('scripts/generate-notification-sounds.cjs');
    expect(app).toContain('keep_money.wav');
    expect(push).toContain("setNotificationChannelAsync('money'");
    expect(push).toContain("sound: 'keep_money.wav'");
    expect(worker).toContain('isMoneyNotification');
    expect(worker).toContain('keep_money.wav');
    expect(generator).toContain("header.write('RIFF'");
    expect(generator).toContain("header.write('WAVE'");
  });

  it('prunes APNs environment-mismatch tokens and forces a fresh device registration', () => {
    const worker = readRepo('supabase/functions/keep-push-worker/index.ts');
    const backend = readRepo('packages/backend/src/lib/pushNotifications.ts');
    expect(worker).toContain('BadEnvironmentKeyInToken');
    expect(backend).toContain('BadEnvironmentKeyInToken');
    expect(worker).toContain('from("push_tokens").delete()');
  });

  it('keeps the account fields visibly editable without turning them white', () => {
    const form = readMobile('src/components/UsernameAccountForm.tsx');
    expect(form).toContain("AUTH_INPUT_BACKGROUND = '#312C43'");
    expect(form).toContain("AUTH_INPUT_BACKGROUND_FOCUSED = '#3A3450'");
    expect(form).toContain("AUTH_INPUT_TEXT = '#ECE8F2'");
  });
});
