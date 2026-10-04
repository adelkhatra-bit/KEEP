import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Notifications readable-action contract', () => {
  it('keeps frequent notification controls at least 44pt tall', () => {
    expect(source).toContain('chatOpenButton:{minHeight:44');
    expect(source).toContain('chatChooseButton:{minHeight:44');
    expect(source).toContain('chatSurfaceChip:{minHeight:44');
    expect(source).toContain('notificationActionButton: { minHeight: 44');
    expect(source).toContain("cancelPaymentButton:{width:'100%',minHeight:44");
    expect(source).toContain("detailYoutube: { alignSelf: 'flex-start', marginTop: 14, minHeight: 44");
  });

  it('does not use muted gray or sub-11pt labels for interactive notification controls', () => {
    expect(source).toContain('chatSurfaceChipText:{color:colors.textPrimary,fontSize:11');
    expect(source).toContain('notificationActionButtonText: { color: colors.white, fontSize: 11');
    expect(source).toContain('rsvpButtonText: { fontSize: 11');
    expect(source).toContain('readAction: { color: colors.primaryLight, fontSize: 11');
    expect(source).toContain('deleteOneText: { color: colors.danger, fontSize: 11');
  });
});
