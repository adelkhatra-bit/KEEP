const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (msg) => { console.error('PLATFORM BEHAVIOR PARITY FAIL:', msg); process.exitCode = 1; };
const must = (ok, msg) => { if (!ok) fail(msg); };

const contract = JSON.parse(read('config/platform-parity-contract.json'));
const battle = read('packages/mobile/src/components/KeepBattleMobileGameV3.tsx');
const experience = read('packages/mobile/src/services/keepBattleExperienceService.ts');
const audio = read('packages/mobile/src/services/audioPreviewService.ts');
const listen = read('packages/mobile/src/screens/HomeScreenCompact.tsx');
const keepAction = read('packages/mobile/src/services/keepTrackAction.ts');
const sale = read('packages/mobile/src/services/playlistSaleService.ts');

must(contract.version >= 2, 'parity contract version must include behavioral parity');
must(contract.requiredChecks.includes('behavior-parity'), 'behavior-parity must be a required check');

must(!/Platform\.OS/.test(experience), 'Battle catalogue/business service must never branch by platform');
must(battle.includes('const ROUND_MS = 10000;'), 'Battle round duration must have one shared source');
must(battle.includes('const SOLO_RESULT_HOLD_MS = 650;'), 'Solo result hold must have one shared source');
must(battle.includes("loadKeepBattleSoloPack(themeCode, roundCount, preferredThemes)"), 'Solo must use shared catalogue loader');
must(experience.includes("p_round_count: Math.max(5, Math.min(roundCount, 30))"), 'Solo round count clamp must be shared');
must(experience.includes("p_theme_codes: selectedThemes.length ? selectedThemes : null"), 'Solo theme filters must be shared');
must(!/Platform\.OS/.test(keepAction), 'KEEP business/credit logic must never branch by platform');
must(!/Platform\.OS/.test(sale), 'Marketplace purchase guards must never branch by platform');

const battlePlatformLines = battle.split('\n').filter(l => l.includes('Platform.OS'));
must(battlePlatformLines.every(l => /useNativeDriver/.test(l)), 'Battle Platform.OS branches may only select animation native driver');

must(audio.includes('element.playbackRate = 1;'), 'Web audio playback rate must stay 1x');
must(audio.includes('element.defaultPlaybackRate = 1;'), 'Web default playback rate must stay 1x');
must(audio.includes('preloadTrackPreviewSegment'), 'Native preview preloading must remain available');
must(listen.includes('preloadTrackPreviewSegment'), 'Listen flow must preload the next track on the shared screen');

must(keepAction.includes('checkOwnKeepLibrary(track)'), 'KEEP must centrally detect already-owned music');
must(sale.includes('DUPLICATE_TRACK_PURCHASE_BLOCKED'), 'Marketplace must surface server duplicate purchase guard');

if (!process.exitCode) {
  console.log('KEEP platform behavior parity: PASS');
  console.log('shared: Battle/Solo timings + catalogue + themes + KEEP + purchases');
  console.log('platform-specific: adapters only (audio/mic/animations/deep links)');
}
