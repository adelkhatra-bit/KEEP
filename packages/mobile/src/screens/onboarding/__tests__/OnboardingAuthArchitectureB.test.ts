// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Adel (22/09/2026) : "Le flux actuel... est bancal. Aucune grande
 * plateforme ne fait ça." -- 3 architectures proposées (maquette
 * https://claude.ai/artifact/7X9ZqhCoYG8iSWtVZE3fio), Architecture B
 * ("zéro friction", façon Shazam) validée par "valider". Cette suite
 * vérifie que l'implémentation respecte exactement ce qui a été validé,
 * sans qu'aucune fonction existante ne disparaisse.
 */
describe('Onboarding -- Architecture B "zéro friction" (Adel, 22/09/2026, maquette validée)', () => {
  const onboarding = readNormalized(__dirname, '..', 'OnboardingScreen.tsx');

  it('auto-entre en essai gratuit au montage (handleGuestPress) sans attendre un tap, sauf intention explicite', () => {
    expect(onboarding).toContain('if (accountOpen || intent.followUsername) return;');
    expect(onboarding).toContain('if (useUserStore.getState().user) return;');
    expect(onboarding).toContain('void handleGuestPress();');
  });

  it('une intention explicite ("+ Suivre" ou ?__keep_auth=create|login) garde la priorité -- jamais écrasée par l\'entrée auto', () => {
    // readWebIntent() gère déjà __keep_auth/__keep_follow ; l'effet
    // d'auto-entrée sort tôt (accountOpen || intent.followUsername) avant
    // de toucher à quoi que ce soit -- donc ce chemin n'est jamais modifié.
    expect(onboarding).toContain("const requested = params.get('__keep_auth');");
    expect(onboarding).toContain('followUsername: (params.get(\'__keep_follow\') || \'\').trim()');
  });

  it('le choix manuel reste disponible en repli, avec une entrée explicite pour les comptes existants -- rien supprimé', () => {
    expect(onboarding).toContain('onPress={handleGuestPress}');
    expect(onboarding).toContain('ESSAYER GRATUITEMENT');
    expect(onboarding).toContain('3 téléchargements sans inscription');
    expect(onboarding).toContain('J’AI DÉJÀ UN COMPTE');
    expect(onboarding).toContain('Créer mon compte');
    expect(onboarding).toContain("setAccountMode('login'); setAccountOpen(true)");
    expect(onboarding).toContain("setAccountMode('create'); setAccountOpen(true)");
    expect(onboarding).toContain('CONTINUER SANS INSCRIPTION');
    expect(onboarding).toContain("Mode démo");
    expect(onboarding).toContain("legalNotice");
  });

  it('les entrées compte restent secondaires (1 seul CTA plein par écran), avec connexion prioritaire pour quelqu’un qui a déjà un mot de passe', () => {
    expect(onboarding).toContain('style={styles.accountGhostButton}');
    expect(onboarding).toContain('style={styles.accountCreateLink}');
    expect(onboarding).not.toContain('style={[styles.button, styles.accountButton]}');
    expect(onboarding).toContain("accountGhostButton:{minHeight:44,alignItems:'center',justifyContent:'center',paddingHorizontal:12}");
  });

  it('"CONTINUER SANS INSCRIPTION" (repli dans le formulaire) garde son style de bouton plein original -- non touché par ce changement', () => {
    expect(onboarding).toContain('style={[styles.button, styles.accountButton, styles.continueTrialButton]}');
  });
});

describe('UsernameAccountForm -- champs agrandis, tooltips, force à 2 tons (Adel, 22/09/2026, maquette validée)', () => {
  const form = readNormalized(__dirname, '..', '..', '..', 'components', 'UsernameAccountForm.tsx');

  it('garde des champs 52px / police 16px et une surface clairement éditable', () => {
    expect(form).toContain("const AUTH_INPUT_BACKGROUND = '#312C43';");
    expect(form).toContain("const AUTH_INPUT_BACKGROUND_FOCUSED = '#3A3450';");
    expect(form).toContain("const AUTH_INPUT_BORDER = '#625B77';");
    expect(form).toContain('input:{minHeight:52,');
    expect(form).toContain('passwordRow:{minHeight:52,');
    expect(form).toContain('fontSize:16');
  });

  it('utilise un gris clair pour les placeholders et un texte saisi légèrement grisé, jamais noir sur fond sombre', () => {
    expect(form).toContain("const AUTH_INPUT_PLACEHOLDER = '#BDB8C7';");
    expect(form).toContain("const AUTH_INPUT_TEXT = '#ECE8F2';");
    const placeholders = form.match(/placeholderTextColor=\{AUTH_INPUT_PLACEHOLDER\}/g) || [];
    expect(placeholders).toHaveLength(4);
    expect(form).toContain('color:AUTH_INPUT_TEXT');
    expect(form).not.toContain('placeholderTextColor={colors.textMuted}');
  });

  it('tooltip ⓘ tap-to-reveal sur pseudo et e-mail, texte conservé (pas supprimé, juste replié)', () => {
    expect(form).toContain("const [openTip, setOpenTip] = useState<'username' | 'email' | null>(null);");
    expect(form).toContain("setOpenTip((v) => (v === 'username' ? null : 'username'))");
    expect(form).toContain("setOpenTip((v) => (v === 'email' ? null : 'email'))");
    expect(form).toContain('Ton pseudo est public et unique.');
    expect(form).toContain("Ton e-mail reste privé -- il sert uniquement à activer ton compte et à récupérer ton mot de passe.");
  });

  it('force du mot de passe simplifiée à 2 tons de marque (ambre/menthe), plus de vert générique #22C55E', () => {
    expect(form).toContain('strengthWeak:{backgroundColor:colors.warning}');
    expect(form).toContain('strengthGood:{backgroundColor:colors.success}');
    expect(form).not.toContain("backgroundColor:'#22C55E'");
    expect(form).not.toContain("backgroundColor:'#F59E0B'");
  });

  it('aucune fonction retirée : suggérer un mot de passe, switch create/login, mot de passe oublié, tous les 13 codes d\'erreur toujours présents', () => {
    expect(form).toContain('SUGGÉRER UN MOT DE PASSE');
    expect(form).toContain('J’ai déjà un compte');
    expect(form).toContain('Mot de passe oublié ?');
    const errorCodes = [
      'invalid_username', 'invalid_password', 'invalid_email', 'email_taken', 'rate_limited',
      'email_link_invalid', 'username_taken', 'username_conflict', 'account_not_created',
      'legacy_profile_requires_original_device', 'invalid_credentials',
      'email_confirmation_required_config', 'email_delivery_unavailable',
    ];
    errorCodes.forEach((code) => expect(form).toContain(`code === '${code}'`));
  });
});

describe('webAutofillFix.ts -- couverture Firefox ajoutée (audit Adel, 22/09/2026)', () => {
  const fix = readNormalized(__dirname, '..', '..', '..', 'utils', 'webAutofillFix.ts');

  it('garde la règle -webkit-autofill (Safari/Chrome) ET ajoute la règle standard :autofill (Firefox)', () => {
    expect(fix).toContain('input:-webkit-autofill,');
    expect(fix).toContain('input:autofill {');
  });
});
