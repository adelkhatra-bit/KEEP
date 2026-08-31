import { APP_NAME } from '../config/brand';

type BattleInviteCopyArgs = {
  inviterName: string;
  themeLabel?: string;
  arenaCode?: string;
  link: string;
};

function safeName(value: string) {
  const trimmed = String(value || '').trim();
  return trimmed || 'Un ami';
}

export function buildBattleInviteMessage(language: string, args: BattleInviteCopyArgs): string {
  const name = safeName(args.inviterName);
  const theme = String(args.themeLabel || 'Music').trim();
  const codeLine = args.arenaCode ? `\nCode : ${args.arenaCode}` : '';
  const lang = String(language || 'en').toLowerCase().split('-')[0];

  if (lang === 'fr') {
    return `🎧 ${name} t’invite sur ${APP_NAME}\n\nViens tester ta culture musicale et relève mon défi ${theme}. 3 réponses, une seule est juste. Le plus rapide prend l’avantage.\n\nTu me bats ?${codeLine}\n${args.link}`;
  }

  return `🎧 ${name} invited you to ${APP_NAME}\n\nTest your music knowledge and take my ${theme} challenge. 3 choices, only one is right. Speed breaks the tie.\n\nThink you can beat me?${codeLine}\n${args.link}`;
}

export function buildSoloChallengeMessage(language: string, args: Omit<BattleInviteCopyArgs, 'arenaCode'> & { score: number; total: number }): string {
  const name = safeName(args.inviterName);
  const lang = String(language || 'en').toLowerCase().split('-')[0];
  if (lang === 'fr') {
    return `🎧 ${name} vient de tester sa culture musicale sur ${APP_NAME} : ${args.score}/${args.total}.\n\nÀ ton tour. Tu fais mieux ?\n${args.link}`;
  }
  return `🎧 ${name} just tested their music knowledge on ${APP_NAME}: ${args.score}/${args.total}.\n\nYour turn. Can you beat that?\n${args.link}`;
}
