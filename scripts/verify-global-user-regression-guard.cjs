#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const failures = [];
const requireText = (file, text, why) => {
  const src = read(file);
  if (!src.includes(text)) failures.push(`${file}: ${why} — attendu: ${JSON.stringify(text)}`);
};
const forbidText = (file, text, why) => {
  const src = read(file);
  if (src.includes(text)) failures.push(`${file}: ${why} — interdit: ${JSON.stringify(text)}`);
};

// 1) Invariant centrale : un vrai profil Supabase ne peut jamais conserver
//    les drapeaux invité/démo d'une identité précédente.
requireText(
  'packages/mobile/src/store/useUserStore.ts',
  'return { user, isDemoMode: false, isAnonymous: false, isLocalGuest: false };',
  'setUser doit convertir globalement le store en compte réel',
);

// 2) Profil propriétaire : la décision compte/invité doit être issue de
//    l'identité authentifiée réellement réconciliée.
requireText(
  'packages/mobile/src/screens/ProfilePublicScreen.tsx',
  'const accountRequired = !effectiveAuthenticatedUserId;',
  'le profil propriétaire doit utiliser la session réelle',
);
requireText(
  'packages/mobile/src/screens/ProfilePublicScreen.tsx',
  'auth.getCurrentSession()',
  'le profil propriétaire doit réconcilier la session Supabase',
);

// 3) Profil visité : même invariant + aucun saut vers Soirées pour un événement.
requireText(
  'packages/mobile/src/screens/PublicUserProfileScreen.tsx',
  'const effectiveViewerId = authenticatedViewerId',
  'le profil visité doit utiliser une identité Supabase effective',
);
forbidText(
  'packages/mobile/src/screens/PublicUserProfileScreen.tsx',
  "navigation.navigate('Parties', { openEventId",
  'un événement du profil doit rester inline',
);
requireText(
  'packages/mobile/src/screens/PublicUserProfileScreen.tsx',
  'EN ATTENTE D’APPROBATION',
  'un événement pending doit afficher explicitement son état',
);

// 4) Pépites : jamais d’impasse plein écran sans retour.
requireText(
  'packages/mobile/src/components/PlaylistSalePanel.tsx',
  'const accountRequired = !effectiveAuthenticatedUserId;',
  'Pépites doit utiliser la session réelle',
);
requireText(
  'packages/mobile/src/components/PlaylistSalePanel.tsx',
  '<Text style={s.guestGateBackText}>‹ RETOUR</Text>',
  'le mode essai Pépites doit toujours offrir un retour visible',
);
forbidText(
  'packages/mobile/src/components/PlaylistSalePanel.tsx',
  'Mode invité : connecte-toi pour publier une collection exclusive.',
  'l’ancien écran bloquant Pépites ne doit jamais revenir',
);

// 5) Tchat : l'activation reste un réglage INDIVIDUEL, mais la languette
//    de découverte reste visible pour un compte réel afin que l'utilisateur
//    puisse activer/ouvrir le Tchat d'un tap. OFF = pas de conversation active,
//    pas disparition du contrôle.
requireText(
  'packages/mobile/src/components/GlobalChatDock.tsx',
  'const [chatEnabled, setChatEnabled] = useState(false);',
  'le Tchat global doit conserver son état d’activation individuel',
);
requireText(
  'packages/mobile/src/components/GlobalChatDock.tsx',
  'setChatEnabled(Boolean(settings.homeEnabled));',
  'le dock doit respecter le réglage utilisateur enregistré',
);
requireText(
  'packages/mobile/src/components/GlobalChatDock.tsx',
  'if (!previewOnly && !settingsOpen && !accountReady && !open) return null;',
  'la languette Tchat doit rester disponible pour un compte réel, même si le Tchat est OFF, sans fermer une fenêtre déjà ouverte pendant une hydratation auth',
);
requireText(
  'packages/mobile/src/components/GlobalChatDock.tsx',
  'if (!enabled && !settings.homeEnabled) closeChat();',
  'une activation ou une sauvegarde transitoire ne doit jamais refermer automatiquement le Tchat',
);
forbidText(
  'packages/mobile/src/components/GlobalChatDock.tsx',
  '(!accountReady || !chatEnabled)) return null',
  'un Tchat OFF ne doit plus faire disparaître la languette latérale',
);
requireText(
  'packages/mobile/src/components/GlobalChatDock.tsx',
  "chatEnabled ? 'Ouvrir le Tchat' : 'Activer et ouvrir le Tchat'",
  'la languette doit expliquer qu’un tap active puis ouvre le Tchat quand il est OFF',
);

// 6) Soirées / Playlists : explications derrière un ? compact, pas de mur de texte.
forbidText(
  'packages/mobile/src/screens/PartiesScreen.tsx',
  'Événements · Soirées · Invitations',
  'le sous-titre encombrant Soirées ne doit pas revenir',
);
forbidText(
  'packages/mobile/src/screens/PartiesScreen.tsx',
  'Publie, retrouve tes événements et réponds à tes invitations.',
  'l’aide Soirées doit rester dans le ?',
);
requireText(
  'packages/mobile/src/screens/PartiesScreen.tsx',
  'eventHelpButton',
  'Soirées doit garder son ? d’aide',
);
forbidText(
  'packages/mobile/src/screens/MyMusicScreen.tsx',
  'Écouter · Trier · Organiser',
  'le sous-titre encombrant Playlists ne doit pas revenir',
);
forbidText(
  'packages/mobile/src/screens/MyMusicScreen.tsx',
  'Choisis une action. Tu peux revenir ici quand tu veux.',
  'l’aide Playlists doit rester dans le ?',
);
requireText(
  'packages/mobile/src/screens/MyMusicScreen.tsx',
  'headerHelpButton',
  'Playlists doit garder son ? d’aide',
);

// 7) Picker de type de profil : jamais noir/noir, contour bleu + actif bleu.
const profile = read('packages/mobile/src/screens/ProfilePublicScreen.tsx');
if (!/kindChoice:\{[^}]*borderColor:colors\.(?:info|primaryLight)/s.test(profile)) {
  failures.push('ProfilePublicScreen.tsx: les choix "Ton profil Loki" doivent avoir un contour bleu');
}
if (!/kindChoiceOn:\{[^}]*backgroundColor:colors\.(?:info|primary)/s.test(profile)) {
  failures.push('ProfilePublicScreen.tsx: le choix actif "Ton profil Loki" doit être bleu');
}

if (failures.length) {
  console.error('GLOBAL USER REGRESSION GUARD — FAIL');
  failures.forEach((f, i) => console.error(`${i + 1}. ${f}`));
  process.exit(1);
}

console.log('GLOBAL USER REGRESSION GUARD — PASS');
console.log('Auth réelle globale, languette Tchat persistante, réglages individuels préservés, Pépites, événements inline, aides compactes et picker profil verrouillés.');
