import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import {
  buildKeepBattleArenaInviteLink,
  joinKeepBattleArena,
  KeepBattleArenaLobby,
  KeepBattleArenaState,
  KeepBattleTheme,
  loadKeepBattleArena,
  loadKeepBattleArenaLobby,
  loadKeepBattleThemes,
  refreshKeepBattleCatalog,
  startKeepBattleArena,
  submitKeepBattleArenaQuizAnswer,
  subscribeKeepBattleArena,
} from '../services/keepBattleService';
import {
  KeepBattleOpenSalon,
  KeepBattleThemeLobby,
  loadBattleThemeLobby,
  loadOpenBattleSalons,
} from '../services/keepBattleSalonService';
import {
  KeepBattleSoloPack,
  loadKeepBattleSoloPack,
} from '../services/keepBattleExperienceService';
import { supabase } from '../services/supabaseClient';

type Props = {
  enabled: boolean;
  onOpenProfile: (username: string) => void;
  onRequireAccount?: () => void;
};

const FALLBACK_THEMES: KeepBattleTheme[] = [
  { code: 'MIX', label: 'Mix surprise' },
  { code: 'RAP_FR', label: 'Rap français' },
  { code: 'RAP_US', label: 'Rap US' },
  { code: 'FUNK', label: 'Funk' },
  { code: 'JAZZ', label: 'Jazz' },
  { code: 'DISCO', label: 'Disco' },
  { code: 'AFRO', label: 'Afro / Afrobeats' },
  { code: 'ELECTRO', label: 'Electro' },
  { code: 'POP', label: 'Pop' },
  { code: 'RNB', label: 'R&B' },
  { code: 'ROCK', label: 'Rock' },
  { code: 'LATINO', label: 'Latino' },
  { code: 'RAI', label: 'Raï / Maghreb' },
];

function formatSeconds(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(2)} s`;
}

function battleError(rawValue: unknown, fallback: string) {
  const raw = String((rawValue as any)?.message || rawValue || '');
  if (raw.includes('MINIMUM_THREE_FREE')) return 'Il faut au moins 3 Free disponibles pour jouer avec d’autres personnes.';
  if (raw.includes('BATTLE_CATALOG_TOO_SMALL')) return 'Le catalogue musical du Battle est en cours de préparation. Réessaie dans quelques secondes.';
  if (raw.includes('AUTH_REQUIRED')) return 'Connecte ton compte KEEP pour jouer avec d’autres personnes.';
  return raw || fallback;
}

export default function KeepBattleArenaPanel({ enabled, onOpenProfile, onRequireAccount }: Props) {
  const [themes, setThemes] = React.useState<KeepBattleTheme[]>(FALLBACK_THEMES);
  const [themeCode, setThemeCode] = React.useState('MIX');
  const [salonThemeFilter, setSalonThemeFilter] = React.useState<string | null>(null);
  const [lobby, setLobby] = React.useState<KeepBattleArenaLobby | null>(null);
  const [themeLobby, setThemeLobby] = React.useState<KeepBattleThemeLobby[]>([]);
  const [openSalons, setOpenSalons] = React.useState<KeepBattleOpenSalon[]>([]);
  const [salonsLoading, setSalonsLoading] = React.useState(true);
  const [salonsError, setSalonsError] = React.useState('');
  const [busySalonId, setBusySalonId] = React.useState('');
  const [arena, setArena] = React.useState<KeepBattleArenaState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingAnswer, setPendingAnswer] = React.useState<string | null>(null);
  const [soundOn, setSoundOn] = React.useState(true);
  const [now, setNow] = React.useState(Date.now());
  const [soloPack, setSoloPack] = React.useState<KeepBattleSoloPack | null>(null);
  const [soloIndex, setSoloIndex] = React.useState(0);
  const [soloAnswer, setSoloAnswer] = React.useState<string | null>(null);
  const [soloScore, setSoloScore] = React.useState(0);
  const [soloBusy, setSoloBusy] = React.useState(false);

  const refreshLobby = React.useCallback(async () => {
    try { setLobby(await loadKeepBattleArenaLobby()); } catch { }
  }, []);

  const refreshSalons = React.useCallback(async () => {
    setSalonsLoading(true);
    try {
      const [salons, themesSummary] = await Promise.all([
        loadOpenBattleSalons(salonThemeFilter),
        loadBattleThemeLobby(),
      ]);
      setOpenSalons(salons);
      setThemeLobby(themesSummary);
      setSalonsError('');
    } catch {
      setSalonsError('Impossible de charger les salons ouverts pour le moment.');
    } finally {
      setSalonsLoading(false);
    }
  }, [salonThemeFilter]);

  const refreshArena = React.useCallback(async () => {
    if (!arena?.id) return;
    try {
      const next = await loadKeepBattleArena(arena.id);
      setArena(next);
      if (next.round?.answered) setPendingAnswer(null);
    } catch { }
  }, [arena?.id]);

  React.useEffect(() => {
    let live = true;
    void loadKeepBattleThemes().then((rows) => { if (live && rows.length) setThemes(rows); }).catch(() => {});
    if (enabled) void refreshKeepBattleCatalog(24).catch(() => null);
    void refreshLobby();
    return () => { live = false; };
  }, [enabled, refreshLobby]);

  React.useEffect(() => {
    let live = true;
    const reload = async () => {
      if (!live) return;
      await refreshSalons();
    };
    void reload();
    const timer = setInterval(() => { void reload(); }, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [refreshSalons]);

  React.useEffect(() => {
    if (!arena?.id) return undefined;
    const unsubscribe = subscribeKeepBattleArena(arena.id, () => { void refreshArena(); });
    const timer = setInterval(() => { void refreshArena(); }, 650);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [arena?.id, refreshArena]);

  React.useEffect(() => {
    if (arena?.status !== 'ACTIVE' || !arena.round) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [arena?.status, arena?.round?.position, arena?.matchNo]);

  React.useEffect(() => {
    const round = arena?.round;
    if (!arena || arena.status !== 'ACTIVE' || !round?.previewUrl || !soundOn) return;
    const phase = `${arena.id}:${arena.matchNo}:${round.position}:${round.revealed ? 'reveal' : 'listen'}`;
    const duration = round.revealed ? 3800 : Math.max(2500, Math.min(arena.roundDurationMs || 12000, 15000));
    void stopTrackPreview().then(() => playTrackPreviewSegment(`battle:${phase}`, round.previewUrl as string, 0, duration)).catch(() => {});
  }, [arena?.id, arena?.status, arena?.matchNo, arena?.round?.position, arena?.round?.revealed, arena?.round?.previewUrl, arena?.roundDurationMs, soundOn]);

  React.useEffect(() => {
    const round = soloPack?.rounds?.[soloIndex];
    if (!round?.previewUrl || !soundOn) return;
    void stopTrackPreview().then(() => playTrackPreviewSegment(`battle:solo:${soloPack?.themeCode}:${soloIndex}`, round.previewUrl, 0, 12000)).catch(() => {});
  }, [soloPack, soloIndex, soundOn]);

  React.useEffect(() => () => { void stopTrackPreview(); }, []);

  const requireAccount = () => {
    Alert.alert('Compte KEEP requis', 'Le mode solo fonctionne sans compte. Connecte ton compte uniquement pour jouer avec d’autres personnes.', [
      { text: 'Jouer seul', style: 'cancel' },
      { text: 'Mon compte', onPress: onRequireAccount },
    ]);
  };

  const startSolo = async () => {
    if (soloBusy) return;
    setSoloBusy(true);
    try {
      const pack = await loadKeepBattleSoloPack(themeCode, 8);
      setSoloPack(pack);
      setSoloIndex(0);
      setSoloAnswer(null);
      setSoloScore(0);
    } catch (e: any) {
      Alert.alert('Jouer seul', battleError(e, 'Impossible de démarrer le jeu solo pour le moment.'));
    } finally {
      setSoloBusy(false);
    }
  };

  const answerSolo = (choice: string) => {
    const round = soloPack?.rounds?.[soloIndex];
    if (!round || soloAnswer) return;
    setSoloAnswer(choice);
    if (choice === round.correctAnswer) setSoloScore((value) => value + 1);
  };

  const nextSolo = () => {
    if (!soloPack) return;
    if (soloIndex >= soloPack.rounds.length - 1) return;
    setSoloIndex((value) => value + 1);
    setSoloAnswer(null);
  };

  const shareSolo = async () => {
    const completed = soloIndex + (soloAnswer ? 1 : 0);
    await Share.share({
      message: `🎧 KEEP BATTLE — Je joue en solo sur ${themes.find((item) => item.code === soloPack?.themeCode)?.label || 'KEEP'}. Score ${soloScore}/${Math.max(1, completed)}. Viens tester ton oreille musicale sur KEEP !\nhttps://adelkhatra-bit.github.io/KEEP/`,
    }).catch(() => {});
  };

  const enterSalon = async (salon: KeepBattleOpenSalon) => {
    if (!enabled || !supabase) return requireAccount();
    if (busy || busySalonId) return;
    setBusySalonId(salon.id);
    try {
      const joined = await joinKeepBattleArena(salon.arenaCode);
      setArena(await loadKeepBattleArena(joined.id));
      await Promise.all([refreshLobby(), refreshSalons()]);
    } catch (e: any) {
      Alert.alert('Salon KEEP Battle', battleError(e, 'Impossible de rejoindre ce salon pour le moment.'));
    } finally {
      setBusySalonId('');
    }
  };

  const autoMatch = async () => {
    if (!enabled || !supabase) return requireAccount();
    if (busy) return;
    setBusy(true);
    try {
      await refreshKeepBattleCatalog(24).catch(() => null);
      const { data, error } = await supabase.rpc('keep_battle_arena_matchmake', { p_theme_code: themeCode });
      if (error) throw error;
      const id = String((data as any)?.id || '');
      if (!id) throw new Error('Arène introuvable.');
      setArena(await loadKeepBattleArena(id));
      await Promise.all([refreshLobby(), refreshSalons()]);
    } catch (e: any) {
      Alert.alert('Jouer avec d’autres', battleError(e, 'Impossible de rejoindre une arène pour le moment.'));
    } finally { setBusy(false); }
  };

  const shareArena = async () => {
    if (!arena) return;
    const link = buildKeepBattleArenaInviteLink(arena.arenaCode);
    await Share.share({ message: `🎧 KEEP BATTLE\nRejoins directement mon salon KEEP avec ce lien :\n${link}` }).catch(() => {});
  };

  const startArena = async () => {
    if (!arena || busy) return;
    setBusy(true);
    try { setArena(await startKeepBattleArena(arena.id)); }
    catch (e: any) { Alert.alert('Démarrer le Battle', e?.message || 'Il faut au moins 2 joueurs éligibles.'); }
    finally { setBusy(false); }
  };

  const answer = async (choice: string) => {
    if (!arena || arena.status !== 'ACTIVE' || arena.round?.answered || pendingAnswer || arena.round?.revealed) return;
    setPendingAnswer(choice);
    try { setArena(await submitKeepBattleArenaQuizAnswer(arena.id, choice)); }
    catch (e: any) {
      setPendingAnswer(null);
      Alert.alert('Réponse Battle', e?.message || 'La réponse n’a pas pu être enregistrée.');
    }
  };

  const activeTheme = themes.find((item) => item.code === themeCode)?.label || 'Mix surprise';

  if (soloPack) {
    const round = soloPack.rounds[soloIndex];
    const finished = Boolean(soloAnswer) && soloIndex >= soloPack.rounds.length - 1;
    const correct = soloAnswer === round.correctAnswer;
    return <View style={s.card}>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>KEEP BATTLE · SOLO</Text>
          <Text style={s.title}>Teste ton oreille musicale.</Text>
          <Text style={s.subtitle}>Aucun Free dépensé. Aucun compte obligatoire. Écoute puis choisis l’artiste.</Text>
        </View>
        <TouchableOpacity style={s.soundButton} onPress={() => setSoundOn((value) => !value)} accessibilityLabel={soundOn ? 'Couper le son' : 'Activer le son'}>
          <Text style={s.soundText}>{soundOn ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.soloScoreRow}>
        <Text style={s.soloScore}>SCORE {soloScore}/{soloPack.rounds.length}</Text>
        <Text style={s.soloProgress}>MORCEAU {soloIndex + 1}/{soloPack.rounds.length}</Text>
      </View>

      <View style={s.hiddenCover}>
        {round.artworkUrl && soloAnswer ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <Text style={s.question}>{soloAnswer ? '♫' : '?'}</Text>}
      </View>

      <Text style={s.listenText}>{soloAnswer ? `${round.artist} — ${round.title}` : 'Écoute. Qui est l’artiste ?'}</Text>
      <View style={s.choices}>
        {round.choices.map((choice) => {
          const selected = soloAnswer === choice;
          const right = Boolean(soloAnswer) && choice === round.correctAnswer;
          return <TouchableOpacity key={choice} style={[s.choice, selected && s.choiceSelected, right && s.choiceCorrect]} disabled={Boolean(soloAnswer)} onPress={() => answerSolo(choice)}>
            <Text style={s.choiceText} numberOfLines={2}>{choice}</Text>
          </TouchableOpacity>;
        })}
      </View>

      {soloAnswer ? <View style={s.revealResult}>
        <Text style={correct ? s.correct : s.wrong}>{correct ? '✓ BONNE RÉPONSE' : `✕ RÉPONSE : ${round.correctAnswer}`}</Text>
      </View> : null}

      <View style={s.rowButtons}>
        <TouchableOpacity style={s.secondaryButton} onPress={() => void shareSolo()}><Text style={s.secondaryButtonText}>PARTAGER</Text></TouchableOpacity>
        {!finished ? <TouchableOpacity style={[s.primaryButton, !soloAnswer && s.disabled]} onPress={nextSolo} disabled={!soloAnswer}><Text style={s.primaryButtonText}>MORCEAU SUIVANT</Text></TouchableOpacity> : <TouchableOpacity style={s.primaryButton} onPress={() => void startSolo()}><Text style={s.primaryButtonText}>REJOUER</Text></TouchableOpacity>}
      </View>
      <TouchableOpacity style={s.returnButton} onPress={() => { setSoloPack(null); setSoloAnswer(null); void stopTrackPreview(); }}><Text style={s.link}>RETOUR AUX SALONS</Text></TouchableOpacity>
    </View>;
  }

  if (arena) {
    const activePlayers = arena.seats?.length ?? 0;
    const isQueued = arena.me?.status === 'QUEUED';
    const jackpot = Math.max(0, (activePlayers - 1) * 3);
    const round = arena.round ?? null;
    const frozenMs = round?.myAnswer?.responseMs ?? null;
    const remainingMs = round?.closesAt ? Math.max(0, new Date(round.closesAt).getTime() - now) : (arena.roundDurationMs ?? 12000);
    const displayMs = frozenMs ?? remainingMs;

    return <View style={s.card}>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>KEEP ARENA · {arena.themeCode}</Text>
          <Text style={s.title}>Salon multijoueur.</Text>
          <Text style={s.subtitle}>{activePlayers}/{arena.maxPlayers} joueurs · jackpot +{jackpot} Free · file {arena.queue}</Text>
        </View>
        <TouchableOpacity style={s.soundButton} onPress={() => setSoundOn((value) => !value)}><Text style={s.soundText}>{soundOn ? '🔊' : '🔇'}</Text></TouchableOpacity>
      </View>

      <View style={s.seats}>
        {arena.seats.slice(0, 10).map((seat) => <TouchableOpacity key={seat.profileId} style={s.seat} onPress={() => onOpenProfile(seat.username)}>
          <View style={s.avatarWrap}>{seat.avatarUrl ? <Image source={{ uri: seat.avatarUrl }} style={s.avatar} /> : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarLetter}>{seat.username.slice(0, 1).toUpperCase()}</Text></View>}</View>
          <Text style={s.seatName} numberOfLines={1}>@{seat.username}</Text>
        </TouchableOpacity>)}
      </View>

      {isQueued ? <View style={s.waitBox}><Text style={s.waitTitle}>Tu es dans la file d’attente</Text><Text style={s.waitText}>KEEP t’installe automatiquement dès qu’une place est disponible.</Text></View> : null}

      {arena.status === 'WAITING' && !isQueued ? <>
        <View style={s.waitBox}><Text style={s.waitTitle}>SALON PRÊT</Text><Text style={s.waitText}>{activePlayers < 2 ? 'Partage le lien : ton ami rejoint directement le salon, sans saisir de code.' : 'Vous pouvez démarrer.'}</Text></View>
        <View style={s.rowButtons}>
          <TouchableOpacity style={s.secondaryButton} onPress={() => void shareArena()}><Text style={s.secondaryButtonText}>INVITER / PARTAGER</Text></TouchableOpacity>
          <TouchableOpacity style={[s.primaryButton, activePlayers < 2 && s.disabled]} onPress={() => void startArena()} disabled={busy || activePlayers < 2}><Text style={s.primaryButtonText}>{busy ? '...' : 'DÉMARRER'}</Text></TouchableOpacity>
        </View>
      </> : null}

      {arena.status === 'ACTIVE' && round && !isQueued ? <View style={s.gameBox}>
        <View style={s.roundHeader}><Text style={s.roundLabel}>ROUND {arena.currentRound}/{arena.roundCount}</Text><Text style={s.timer}>{round.answered ? `🔒 ${formatSeconds(displayMs)}` : `◷ ${formatSeconds(displayMs)}`}</Text></View>
        <View style={s.hiddenCover}>
          {round.revealed && round.artworkUrl ? <Image source={{ uri: round.artworkUrl }} style={s.cover} /> : <Text style={s.question}>{round.revealed ? '♫' : '?'}</Text>}
        </View>
        <Text style={s.listenText}>{round.revealed ? `${round.artist || 'Artiste'} — ${round.title || 'Titre'}` : round.answered ? 'Réponse verrouillée · attends les autres' : 'Écoute. Qui est l’artiste ?'}</Text>
        {!round.revealed ? <View style={s.choices}>{(round.choices ?? []).map((choice) => {
          const selected = round.myAnswer?.selectedAnswer === choice || pendingAnswer === choice;
          const locked = Boolean(round.answered || pendingAnswer);
          return <TouchableOpacity key={choice} style={[s.choice, selected && s.choiceSelected, locked && !selected && s.choiceLocked]} onPress={() => void answer(choice)} disabled={locked}>
            <Text style={s.choiceText} numberOfLines={2}>{choice}</Text>
          </TouchableOpacity>;
        })}</View> : <View style={s.revealResult}><Text style={round.myAnswer?.correct ? s.correct : s.wrong}>{round.myAnswer?.correct ? `✓ BONNE RÉPONSE · +${round.myAnswer?.points ?? 0} pts` : '✕ MAUVAISE RÉPONSE'}</Text></View>}
      </View> : null}

      <View style={s.bottomRow}><TouchableOpacity onPress={() => { setArena(null); void refreshSalons(); }}><Text style={s.link}>RETOUR AUX SALONS</Text></TouchableOpacity><TouchableOpacity onPress={() => void shareArena()}><Text style={s.link}>PARTAGER</Text></TouchableOpacity></View>
    </View>;
  }

  const totalOpen = themeLobby.reduce((sum, item) => sum + item.openSalons, 0);
  const totalPlayers = themeLobby.reduce((sum, item) => sum + item.players, 0);

  return <View style={s.card}>
    <Text style={s.kicker}>KEEP BATTLE · SALONS UTILISATEURS</Text>
    <Text style={s.title}>Joue seul ou avec d’autres.</Text>
    <Text style={s.subtitle}>Aucun code à écrire. En solo, tu joues immédiatement. Avec des amis, un simple lien partagé ouvre le salon.</Text>

    <Text style={s.label}>CHOISIS TON STYLE MUSICAL</Text>
    <View style={s.themeWrap}>{themes.map((theme) => <TouchableOpacity key={theme.code} style={[s.themeChip, themeCode === theme.code && s.themeChipOn]} onPress={() => setThemeCode(theme.code)}><Text style={s.themeText}>{theme.label}</Text></TouchableOpacity>)}</View>

    <TouchableOpacity style={s.bigPlay} onPress={() => void startSolo()} disabled={soloBusy}><Text style={s.bigPlayText}>{soloBusy ? 'PRÉPARATION…' : '⚡ JOUER MAINTENANT'}</Text></TouchableOpacity>
    <Text style={s.playHint}>Solo immédiat · 0 Free · partage disponible pendant la partie.</Text>

    <TouchableOpacity style={s.multiPlay} onPress={() => void autoMatch()} disabled={busy || Boolean(busySalonId)}><Text style={s.multiPlayText}>{busy ? 'RECHERCHE DU SALON…' : 'JOUER AVEC D’AUTRES'}</Text></TouchableOpacity>
    <Text style={s.playHint}>Compte KEEP + 3 Free minimum. Si aucun salon n’existe, KEEP crée le tien automatiquement.</Text>

    <View style={s.separator}><View style={s.separatorLine}/><Text style={s.separatorText}>SALONS OUVERTS</Text><View style={s.separatorLine}/></View>
    <View style={s.salonSummary}>
      <Text style={s.salonSummaryText}>{totalOpen} salon{totalOpen > 1 ? 's' : ''}</Text>
      <Text style={s.salonSummaryText}>{totalPlayers} joueur{totalPlayers > 1 ? 's' : ''}</Text>
      <TouchableOpacity onPress={() => void refreshSalons()}><Text style={s.refreshText}>ACTUALISER</Text></TouchableOpacity>
    </View>

    <Text style={s.label}>FILTRER LES SALONS</Text>
    <View style={s.themeWrap}>
      <TouchableOpacity style={[s.themeChip, salonThemeFilter === null && s.themeChipOn]} onPress={() => setSalonThemeFilter(null)}><Text style={s.themeText}>Tous</Text></TouchableOpacity>
      {themes.map((theme) => {
        const summary = themeLobby.find((row) => row.code === theme.code);
        return <TouchableOpacity key={`salon-${theme.code}`} style={[s.themeChip, salonThemeFilter === theme.code && s.themeChipOn]} onPress={() => setSalonThemeFilter(theme.code)}><Text style={s.themeText}>{theme.label}{summary?.openSalons ? ` · ${summary.openSalons}` : ''}</Text></TouchableOpacity>;
      })}
    </View>

    <View style={s.salonList}>
      {salonsLoading && openSalons.length === 0 ? <View style={s.salonLoading}><ActivityIndicator color="#B693FF"/><Text style={s.salonMuted}>Recherche des salons ouverts…</Text></View> : null}
      {salonsError ? <View style={s.salonError}><Text style={s.salonErrorText}>{salonsError}</Text><TouchableOpacity onPress={() => void refreshSalons()}><Text style={s.refreshText}>RÉESSAYER</Text></TouchableOpacity></View> : null}
      {!salonsLoading && !salonsError && openSalons.length === 0 ? <View style={s.emptySalon}><Text style={s.emptySalonTitle}>Aucun salon ouvert.</Text><Text style={s.salonMuted}>Appuie sur “Jouer avec d’autres” : KEEP créera automatiquement le tien.</Text></View> : null}
      {openSalons.map((salon) => {
        const joining = busySalonId === salon.id;
        const full = salon.openSeats <= 0;
        return <View key={salon.id} style={s.salonCard}>
          <View style={s.salonTopRow}>
            <TouchableOpacity style={s.salonHost} onPress={() => onOpenProfile(salon.hostUsername)}>
              {salon.hostAvatarUrl ? <Image source={{ uri: salon.hostAvatarUrl }} style={s.salonAvatar}/> : <View style={[s.salonAvatar,s.avatarFallback]}><Text style={s.avatarLetter}>{salon.hostUsername.slice(0,1).toUpperCase()}</Text></View>}
              <View style={{flex:1}}><Text style={s.salonHostLabel}>CRÉÉ PAR</Text><Text style={s.salonHostName}>@{salon.hostUsername}</Text></View>
            </TouchableOpacity>
            <View style={s.statusPill}><Text style={s.statusText}>{salon.status === 'ACTIVE' ? 'EN COURS' : 'OUVERT'}</Text></View>
          </View>
          <View style={s.salonThemeRow}><Text style={s.salonTheme}>{salon.themeLabel}</Text><Text style={s.jackpot}>+{salon.jackpotFree} FREE</Text></View>
          <Text style={s.salonStats}>{salon.players}/{salon.maxPlayers} joueurs · {salon.openSeats} place{salon.openSeats > 1 ? 's' : ''} libre{salon.openSeats > 1 ? 's' : ''} · file {salon.queue}</Text>
          <TouchableOpacity style={[s.enterButton, joining && s.disabled]} onPress={() => void enterSalon(salon)} disabled={Boolean(busy || busySalonId)}><Text style={s.enterButtonText}>{joining ? 'ENTRÉE…' : full ? 'REJOINDRE LA FILE' : 'ENTRER DANS CE SALON'}</Text></TouchableOpacity>
        </View>;
      })}
    </View>

    <View style={s.lobbyLine}><Text style={s.lobbyText}>{lobby ? `${lobby.activePlayers} en arène · ${lobby.queuedPlayers} en attente` : 'Lobby en direct'}</Text><Text style={s.themeSelected}>{activeTheme}</Text></View>
  </View>;
}

const s = StyleSheet.create({
  card:{marginBottom:10,padding:14,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#5E4385'},
  kicker:{color:'#B693FF',fontSize:12,fontWeight:'900',letterSpacing:.8},title:{color:'#FFF',fontSize:20,fontWeight:'900',marginTop:4},subtitle:{color:'#FFF',fontSize:14,lineHeight:20,marginTop:5},
  headRow:{flexDirection:'row',alignItems:'center',gap:8},soundButton:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:'#6D5090',alignItems:'center',justifyContent:'center',backgroundColor:'#21182F'},soundText:{fontSize:19},
  label:{color:'#D9C8F7',fontSize:13,fontWeight:'900',marginTop:14,marginBottom:8},themeWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},themeChip:{paddingHorizontal:10,paddingVertical:8,borderRadius:16,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F'},themeChipOn:{borderColor:'#B693FF',backgroundColor:'#5B3F8C'},themeText:{color:'#FFF',fontSize:12,fontWeight:'800'},
  bigPlay:{height:52,borderRadius:26,backgroundColor:'#714DAB',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:14},bigPlayText:{color:'#FFF',fontSize:16,fontWeight:'900'},
  multiPlay:{height:48,borderRadius:24,backgroundColor:'#21182F',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:12},multiPlayText:{color:'#FFF',fontSize:14,fontWeight:'900'},playHint:{color:'#FFF',fontSize:12,lineHeight:17,textAlign:'center',marginTop:6},
  separator:{flexDirection:'row',alignItems:'center',gap:8,marginVertical:16},separatorLine:{height:1,flex:1,backgroundColor:'#493369'},separatorText:{color:'#B693FF',fontSize:12,fontWeight:'900'},
  salonSummary:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,paddingHorizontal:11,borderRadius:13,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},salonSummaryText:{color:'#FFF',fontSize:12,fontWeight:'800'},refreshText:{color:'#B693FF',fontSize:12,fontWeight:'900',marginLeft:'auto'},
  salonList:{gap:9,marginTop:10},salonLoading:{minHeight:74,alignItems:'center',justifyContent:'center',gap:7},salonMuted:{color:'#B693FF',fontSize:12,lineHeight:17},salonError:{padding:10,borderRadius:13,borderWidth:1,borderColor:'#8C455A',backgroundColor:'#29131C',flexDirection:'row',alignItems:'center',gap:8},salonErrorText:{flex:1,color:'#FFB6C5',fontSize:12},emptySalon:{padding:12,borderRadius:13,borderWidth:1,borderStyle:'dashed',borderColor:'#493369',alignItems:'center'},emptySalonTitle:{color:'#FFF',fontSize:14,fontWeight:'900',marginBottom:3},
  salonCard:{padding:11,borderRadius:15,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},salonTopRow:{flexDirection:'row',alignItems:'center',gap:8},salonHost:{flex:1,flexDirection:'row',alignItems:'center',gap:8},salonAvatar:{width:38,height:38,borderRadius:19},salonHostLabel:{color:'#B693FF',fontSize:11,fontWeight:'900'},salonHostName:{color:'#FFF',fontSize:14,fontWeight:'900'},statusPill:{paddingHorizontal:8,paddingVertical:5,borderRadius:11,backgroundColor:'#173023',borderWidth:1,borderColor:'#377A58'},statusText:{color:'#FFF',fontSize:11,fontWeight:'900'},salonThemeRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8},salonTheme:{color:'#D9C8F7',fontSize:14,fontWeight:'900'},jackpot:{color:'#E5F266',fontSize:13,fontWeight:'900'},salonStats:{color:'#FFF',fontSize:12,marginTop:4},enterButton:{minHeight:42,paddingHorizontal:13,borderRadius:21,backgroundColor:'#714DAB',borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',marginTop:9},enterButtonText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  lobbyLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:12},lobbyText:{color:'#FFF',fontSize:12},themeSelected:{color:'#7CF2B9',fontSize:12,fontWeight:'900'},
  seats:{flexDirection:'row',flexWrap:'wrap',marginTop:12,rowGap:10},seat:{width:'20%',alignItems:'center',paddingHorizontal:2},avatarWrap:{width:46,height:46,borderRadius:23,padding:2,borderWidth:1,borderColor:'#5E4385'},avatar:{width:'100%',height:'100%',borderRadius:22},avatarFallback:{backgroundColor:'#2A1D3C',alignItems:'center',justifyContent:'center'},avatarLetter:{color:'#FFF',fontSize:17,fontWeight:'900'},seatName:{color:'#FFF',fontSize:11,fontWeight:'900',marginTop:4,maxWidth:70},
  waitBox:{marginTop:12,padding:11,borderRadius:14,backgroundColor:'#100B18',borderWidth:1,borderColor:'#493369'},waitTitle:{color:'#B693FF',fontSize:14,fontWeight:'900'},waitText:{color:'#FFF',fontSize:13,lineHeight:18,marginTop:4},rowButtons:{flexDirection:'row',gap:8,marginTop:10},secondaryButton:{flex:1,minHeight:44,borderRadius:22,borderWidth:1,borderColor:'#B693FF',alignItems:'center',justifyContent:'center',paddingHorizontal:8},secondaryButtonText:{color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center'},primaryButton:{flex:1,minHeight:44,borderRadius:22,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center',paddingHorizontal:8},primaryButtonText:{color:'#111',fontSize:12,fontWeight:'900',textAlign:'center'},disabled:{opacity:.45},
  gameBox:{marginTop:12,padding:11,borderRadius:16,backgroundColor:'#0F0A17',borderWidth:1,borderColor:'#5E4385'},roundHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},roundLabel:{color:'#B693FF',fontSize:13,fontWeight:'900'},timer:{color:'#FFF',fontSize:14,fontWeight:'900'},
  hiddenCover:{height:190,marginTop:10,borderRadius:18,borderWidth:1,borderColor:'#6D5090',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',overflow:'hidden'},question:{color:'#FFF',fontSize:72,fontWeight:'900'},cover:{width:'100%',height:'100%'},listenText:{color:'#FFF',fontSize:14,fontWeight:'800',marginTop:8,textAlign:'center'},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:11},choice:{width:'48.5%',minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#493369',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',paddingHorizontal:8,paddingVertical:6},choiceSelected:{borderColor:'#E5F266',backgroundColor:'#3A4020'},choiceCorrect:{borderColor:'#7CF2B9',backgroundColor:'#153828'},choiceLocked:{opacity:.42},choiceText:{color:'#FFF',fontSize:13,fontWeight:'900',textAlign:'center'},
  revealResult:{marginTop:10,padding:11,borderRadius:13,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},correct:{color:'#7CF2B9',fontSize:14,fontWeight:'900',textAlign:'center'},wrong:{color:'#FF829C',fontSize:14,fontWeight:'900',textAlign:'center'},
  soloScoreRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12},soloScore:{color:'#E5F266',fontSize:14,fontWeight:'900'},soloProgress:{color:'#B693FF',fontSize:13,fontWeight:'900'},
  bottomRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:11},returnButton:{alignSelf:'center',marginTop:12,padding:8},link:{color:'#B693FF',fontSize:12,fontWeight:'900'},
});