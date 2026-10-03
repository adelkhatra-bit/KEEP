// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('global Loki messenger contract', () => {
  const app = read(__dirname, '..', '..', '..', 'App.tsx');
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const dock = read(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx');
  const panel = read(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx');
  const messenger = read(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx');
  const service = read(__dirname, '..', '..', 'services', 'musicAgoraService.ts');

  it('mounts the chat once at application root, never only inside Profile', () => {
    // Adel (02/10/2026) : un seul robot monté, à la racine ou dans l'aperçu ouvert.
    expect(app).toContain("import { RootChatDock } from './src/components/ChatDockHost';");
    expect(app).toContain('{authReady && user ? <RootChatDock /> : null}');
    expect(profile).not.toContain("import GlobalChatDock from '../components/GlobalChatDock';");
    expect(profile).not.toContain('<GlobalChatDock />');
  });

  it('supports all selectable chat surfaces and persists their selection', () => {
    for (const surface of ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']) {
      expect(service).toContain(surface);
      expect(dock).toContain(surface);
      expect(panel).toContain(surface);
    }
    expect(dock).toContain('chatSurfaceForRoute');
    expect(dock).toContain('chatSurfaces.includes(activeSurface)');
    expect(dock).toContain('saveMusicAgoraSettings');
    expect(panel).toContain('toggleChatSurface');
    expect(panel).toContain('accessibilityRole="checkbox"');
  });

  it('plays one short incoming-message beep and keeps voice announcements opt-in', () => {
    expect(dock).toContain("playNotificationCue('DEFAULT')");
    expect(dock).toContain('chatNotificationsEnabled');
  });

  it('plays a recipient-side beep for each realtime chat message unless message sound is silent', () => {
    expect(dock).toContain('loadNotificationPreferences');
    expect(dock).toContain("notificationPrefs?.socialSound !== 'SILENT'");
    expect(dock).toContain("playNotificationCue('DEFAULT')");
    expect(dock).toContain('chatSoundEnabled');
  });

  it('announces and previews the latest sender only after explicit voice opt-in', () => {
    expect(dock).toContain("void speakLokiText(`Message de ${sender}`");
    expect(dock).toContain('Message de');
    expect(dock).toContain('latestChatSender');
    expect(dock).toContain('chatNotificationTarget');
    expect(dock).toContain('drawerPeek');
    expect(dock).toContain('chatVoiceEnabled');
    expect(dock).toContain('saveMusicAgoraVoiceAnnouncements');
    expect(service).toContain('voiceAnnouncementsEnabled');
    expect(panel).toContain('Annonce vocale');
    expect(panel).toContain('Le contenu privé du message n’est jamais lu.');
    expect(dock).not.toContain('Speech.speak(item.body');
  });

  it('keeps the drawer visible in web preview without opening a fake conversation', () => {
    expect(dock).toContain("process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1'");
    expect(dock).toContain('const previewOnly');
    expect(dock).toContain('const displayReady = accountReady || previewOnly');
    expect(dock).toContain("requestAccount('login')");
    expect(dock).toContain("previewOnly ? 'CONNEXION'");
  });

  it('keeps the conversation full-screen, keyboard-safe and readable on mobile', () => {
    expect(messenger).toContain('visualViewport');
    expect(messenger).toContain("const compactBottom = 0;");
    expect(messenger).toContain('KeyboardAvoidingView');
    expect(messenger).toContain("behavior={compact && Platform.OS === 'ios' ? 'padding' : undefined}");
    expect(messenger).toContain("Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'");
    expect(messenger).toContain("const nextInset = Math.max(reportedHeight, coveredByTop);");
    expect(messenger).toContain('top: 0');
    expect(messenger).toContain('bottom: compactBottom');
    expect(messenger).toContain('paddingTop: Math.max(10, safeArea.top + 8)');
    expect(messenger).not.toContain('const compactPanelHeight = Math.min');
    expect(messenger).toContain("fontSize:17,lineHeight:23");
    expect(messenger).toContain("inputCompact:{height:56");
    expect(messenger).toContain('maxLength={2000}');
    expect(messenger).toContain('followChatBottom(initialScrollDone.current)');
    expect(messenger).toContain("keyboardDismissMode={compact ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}");
    expect(messenger).toContain("setTimeout(() => followChatBottom(false), Platform.OS === 'ios' ? 120 : 60)");
    expect(messenger).toContain('{messages.map((message)');
    expect(messenger).toContain('onCompactClose');
    expect(dock).toContain('onCompactClose={closeChat}');
    expect(dock).toContain('closeChat(); setTimeout(() => navigateToSharedProfile(username), 80)');
  });

  it('never replaces the currently open thread when another chat notification arrives', () => {
    expect(dock).toContain('const chatState = useGlobalChatStore.getState()');
    expect(dock).toContain('if (!chatState.isOpen) chatState.prime(chatNotificationTarget(item))');
  });

  it('keeps the control visible and movable left/right around the middle', () => {
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("gesture.dx < -24 ? 'left' : gesture.dx > 24 ? 'right' : side");
    expect(dock).toContain('saveMusicAgoraPosition(nextSide, nextBottom)');
    expect(dock).toContain('const clamped = Math.max(minBottom, Math.min(maxBottom, bottomOffset))');
    expect(dock).toContain('saveMusicAgoraPosition(side, clamped)');
    expect(dock).toContain('chatSettingsReady');
    expect(dock).toContain('setChatSettingsReady(true)');
    expect(dock).toContain('!chatSettingsReady && !open && !settingsOpen');
    expect(dock).toContain('openChat(target);');
    expect(dock).toContain('setChatEnabled(true);');
    expect(dock).toContain("chooseVerticalPreset('HIGH')");
    expect(dock).toContain("chooseVerticalPreset('MIDDLE')");
    expect(dock).toContain("chooseVerticalPreset('LOW')");
    expect(panel).toContain("chooseChatVertical('HIGH')");
    expect(panel).toContain("chooseChatVertical('MIDDLE')");
    expect(panel).toContain("chooseChatVertical('LOW')");
    expect(panel).toContain('HAUTEUR DU BOUTON');
    expect(profile).toContain("key: 'chatSettings'");
    expect(profile).toContain('RÉGLER LA MESSAGERIE');
    expect(profile).toContain('useGlobalChatStore.getState().openSettings()');
    expect(dock).toContain('Math.round(height * 0.44)');
    expect(dock).toContain('fabWrap');
    expect(dock).toContain('fabLeft');
    expect(dock).toContain('fabRight');
    expect(dock).toContain('chatNudge');
    expect(dock).toContain('drawerPeek');
    expect(dock).toContain('drawerGrip');
    expect(dock).toContain("outputRange: [-50, 0]");
    expect(dock).toContain("outputRange: [50, 0]");
    expect(dock).toContain("if (!previewOnly && !settingsOpen && !accountReady && !open) return null;");
    expect(dock).not.toContain("(!accountReady || !chatEnabled)) return null");
    expect(dock).toContain("chatEnabled ? 'Ouvrir le Tchat' : 'Activer et ouvrir le Tchat'");
    expect(dock).toContain('{open ? (');
    expect(dock).not.toContain('{chatEnabled && open ? (');
    expect(dock).toContain('styles.globalOverlay');
    expect(dock).toContain('if (nextSurface) setActiveSurface(nextSurface)');
    expect(dock).toContain('Math.abs(gesture.dx) > 24 || Math.abs(gesture.dy) > 24');
  });

  it('keeps bell messages, activity and settings separated and inline', () => {
    expect(panel).toContain("activeTab === 'MESSAGES'");
    expect(panel).toContain("activeTab === 'ACTIVITY'");
    expect(panel).toContain("activeTab === 'SETTINGS'");
    expect(panel).toContain('MESSAGES');
    expect(panel).toContain('ACTIVITÉ');
    expect(panel).toContain('RÉGLAGES');
    expect(panel).toContain("Messages, activité et réglages au même endroit.");
    expect(panel).toContain('Alertes dans l’application');
    expect(panel).toContain('MESSAGERIE LOKI');
    expect(panel).toContain('Bouton flottant + plein écran');
    expect(panel).toContain('OUVRIR LA CONVERSATION');
    expect(panel).toContain("value === 'AGORA_MUSIC_OFFER'");
    expect(panel).toContain('item.data?.payoutQrUrl');
    expect(panel).not.toContain("navigationRef");
    expect(panel).toContain('useGlobalChatStore.getState().open(target)');
    expect(panel).not.toContain("navigation.navigate");
  });

  it('routes group notifications to the exact private room, never to the sender DM', () => {
    expect(dock).toContain('const groupIdRaw = data.groupId ?? data.group_id');
    expect(dock).toContain('targetProfileId: groupId ? null');
    expect(dock).toContain('initialGroupId={target?.groupId ?? undefined}');
    expect(panel).toContain('const groupIdRaw = data.groupId ?? data.group_id');
    expect(messenger).toContain('initialGroupId?: string');
    expect(messenger).toContain("if (group.myStatus === 'ACTIVE')");
    expect(messenger).toContain('setActiveGroup(group)');
    expect(messenger).toContain('setActiveGroup(null)');
  });

  it('is direct-message first and keeps the public Place secondary', () => {
    expect(messenger).toContain("'MESSAGES' | 'PLACE'");
    expect(messenger).toContain('loadMusicAgoraConversations');
    expect(messenger).toContain('loadMusicAgoraDirectMessages');
    expect(messenger).toContain('MESSAGES');
    expect(messenger).toContain("<Text style={s.publicRoomBadge}>PUBLIC</Text>");
    expect(messenger).toContain("Nouveau groupe privé");
    expect(messenger).toContain('Sur invitation uniquement');
    expect(messenger).toContain("accessibilityLabel=\"Gérer les membres du groupe");
    expect(messenger).toContain("<Text style={[s.drawerActionText, s.drawerActionMusicText]}>MORCEAU</Text>");
  });

  it('keeps music sharing compact, explicit and anti-resale', () => {
    expect(messenger).toContain("PARTAGER LE MORCEAU");
    expect(messenger).toContain('shareOptionsOpen');
    expect(messenger).toContain('shareOwnershipOpen');
    expect(messenger).toContain('🔒 PARTAGE UNIQUEMENT');
    expect(messenger).toContain('FREE et € restent verrouillés');
    expect(messenger).toContain('paymentLocked');
    expect(messenger).toContain('insertQuickReaction(reaction.payload)');
    expect(messenger).toContain('setDraft((current) =>');
    expect(messenger).toContain("PARTAGER LE MORCEAU");
  });

  it('scales private rooms with Realtime instead of 5-second polling', () => {
    expect(service).toContain('subscribeMusicAgoraGroup');
    expect(service).toContain('subscribeMusicAgoraMembership');
    expect(service).toContain("table: 'music_agora_group_messages'");
    expect(service).toContain("table: 'music_agora_group_members'");
    expect(messenger).toContain('subscribeMusicAgoraGroup(activeGroup.id');
    expect(messenger).toContain('subscribeMusicAgoraMembership(currentProfileId');
    expect(messenger).toContain('}, 60000)');
    expect(messenger).not.toContain('}, 5000)');
  });

  it('keeps PayPal QR and payment confirmation inside the chat flow', () => {
    expect(service).toContain('keep_agora_share_my_payout_qr');
    expect(service).toContain('keep_marketplace_terms_status');
    expect(service).toContain('keep_marketplace_accept_terms');
    expect(service).toContain('keep_agora_offer_payment_states');
    expect(messenger).toContain('QR PAYPAL');
    expect(messenger).toContain('paymentInline');
    expect(messenger).toContain('J’AI PAYÉ');
    expect(messenger).toContain('PAIEMENT REÇU · DÉBLOQUER');
    expect(messenger).toContain('markPlaylistSalePaid');
    expect(messenger).toContain('acceptMarketplacePaymentTerms');
  });
});
