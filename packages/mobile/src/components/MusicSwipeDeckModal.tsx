import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import SwipeDeck from './SwipeDeck';
import { stopTrackPreview, toggleTrackPreview } from '../services/audioPreviewService';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { checkOwnKeepLibrary } from '../services/connectedMusicLibrary';
import { colors } from '../theme/colors';

function shuffle<T>(input: T[]): T[] {
  const next = [...input];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

type KeepVisibilityChoice = 'PUBLIC' | 'PRIVATE';
type AlreadyKeptState = 'checking' | 'yes' | 'no';

type Props = {
  visible: boolean;
  tracks: CanonicalTrack[];
  title?: string;
  subtitle?: string;
  emptyTitle?: string;
  backLabel?: string;
  loop?: boolean;
  askVisibilityOnKeep?: boolean;
  previewOnly?: boolean;
  onClose: () => void;
  onKeep?: (track: CanonicalTrack, visibility: KeepVisibilityChoice) => boolean | void | Promise<boolean | void>;
  onPass?: (track: CanonicalTrack) => boolean | void | Promise<boolean | void>;
};

export default function MusicSwipeDeckModal({
  visible,
  tracks,
  title = 'Découverte musicale',
  subtitle,
  emptyTitle = 'Aucun morceau à découvrir.',
  backLabel,
  loop = true,
  askVisibilityOnKeep = false,
  previewOnly = false,
  onClose,
  onKeep,
  onPass,
}: Props) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [deckTracks, setDeckTracks] = useState<CanonicalTrack[]>([]);
  const [processing, setProcessing] = useState(false);
  const [keepPromptOpen, setKeepPromptOpen] = useState(false);
  const [previewInfoOpen, setPreviewInfoOpen] = useState(false);
  const [alreadyKeepInfoOpen, setAlreadyKeepInfoOpen] = useState(false);
  const [alreadyKeptState, setAlreadyKeptState] = useState<AlreadyKeptState>('checking');
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string | null>(null);
  const [previewResolving, setPreviewResolving] = useState(false);
  const actionInFlight = useRef(false);
  const wasVisible = useRef(false);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const current = deckTracks[index];
  const resolvedBackLabel = backLabel || (loop ? 'REVENIR AU PROFIL' : 'REVENIR À LA SESSION');
  const currentAlreadyKept = !previewOnly && alreadyKeptState === 'yes';

  const advanceIndex = useCallback(() => {
    setIndex((currentIndex) => {
      if (currentIndex + 1 >= deckTracks.length) {
        if (loop) {
          const nextRound = shuffle(tracksRef.current);
          setDeckTracks(nextRound);
          setRound((value) => value + 1);
          return nextRound.length ? 0 : nextRound.length;
        }
        return deckTracks.length;
      }
      return currentIndex + 1;
    });
  }, [deckTracks.length, loop]);

  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (wasVisible.current) return;
    wasVisible.current = true;
    actionInFlight.current = false;
    setKeepPromptOpen(false);
    setPreviewInfoOpen(false);
    setAlreadyKeepInfoOpen(false);
    setIndex(0);
    setDeckTracks(loop ? shuffle(tracksRef.current) : [...tracksRef.current]);
    setRound((value) => value + 1);
  }, [visible, loop]);

  useEffect(() => {
    let alive = true;
    setAlreadyKeepInfoOpen(false);
    if (!visible || !current || previewOnly) {
      setAlreadyKeptState(previewOnly ? 'yes' : 'no');
      return () => { alive = false; };
    }

    setAlreadyKeptState('checking');
    void checkOwnKeepLibrary(current)
      .then((result) => {
        if (!alive) return;
        setAlreadyKeptState(result?.exists ? 'yes' : 'no');
      })
      .catch(() => {
        if (alive) setAlreadyKeptState('no');
      });

    return () => { alive = false; };
  }, [visible, previewOnly, current?.id, current?.isrc, current?.title, current?.artist]);

  useEffect(() => {
    let alive = true;
    setKeepPromptOpen(false);
    setPreviewInfoOpen(false);
    setResolvedPreviewUrl(current?.previewUrl?.trim() || null);

    if (!visible || !current) {
      setPreviewResolving(false);
      void stopTrackPreview();
      return () => { alive = false; };
    }

    setPreviewResolving(!current.previewUrl?.trim());
    void resolveTrackPreviewUrl(current)
      .then(async (previewUrl) => {
        if (!alive) return;
        setPreviewResolving(false);
        setResolvedPreviewUrl(previewUrl);
        await stopTrackPreview();
        if (!alive || !previewUrl) return;
        await toggleTrackPreview(
          `swipe-${current.id}-${index}`,
          previewUrl,
          () => {},
          () => {
            if (!alive || actionInFlight.current) return;
            // Dans une session à trier, la fin de l'extrait ne constitue JAMAIS
            // une décision. Le morceau reste affiché jusqu'à PASSER ou GARDER.
            if (!loop) return;
            advanceIndex();
          },
        );
      })
      .catch(() => {
        if (!alive) return;
        setPreviewResolving(false);
        setResolvedPreviewUrl(null);
      });

    return () => {
      alive = false;
      void stopTrackPreview(`swipe-${current.id}-${index}`);
    };
  }, [visible, current?.id, current?.previewUrl, current?.title, current?.artist, index, advanceIndex, loop, round]);

  const advance = async () => {
    await stopTrackPreview();
    advanceIndex();
  };

  const confirmKeep = async (visibility: KeepVisibilityChoice) => {
    if (!current || processing) return;
    setKeepPromptOpen(false);
    setProcessing(true);
    actionInFlight.current = true;
    try {
      const result = await onKeep?.(current, visibility);
      if (result !== false) await advance();
    } finally {
      actionInFlight.current = false;
      setProcessing(false);
    }
  };

  const showAlreadyKept = () => {
    actionInFlight.current = true;
    setKeepPromptOpen(false);
    setAlreadyKeepInfoOpen(true);
  };

  const requestKeep = async () => {
    if (!current || processing) return;
    if (previewOnly) {
      actionInFlight.current = true;
      setPreviewInfoOpen(true);
      return;
    }

    if (currentAlreadyKept) {
      showAlreadyKept();
      return;
    }

    // Si l'utilisateur touche GARDER avant la fin du contrôle asynchrone,
    // on refait une vérification synchrone du scénario critique. Un doublon ne
    // peut donc jamais atteindre le choix Public/Privé ni onKeep().
    if (alreadyKeptState === 'checking') {
      setProcessing(true);
      actionInFlight.current = true;
      try {
        const result = await checkOwnKeepLibrary(current).catch(() => null);
        if (result?.exists) {
          setAlreadyKeptState('yes');
          setProcessing(false);
          showAlreadyKept();
          return;
        }
        setAlreadyKeptState('no');
      } finally {
        setProcessing(false);
        actionInFlight.current = false;
      }
    }

    if (!askVisibilityOnKeep) {
      void confirmKeep('PRIVATE');
      return;
    }
    actionInFlight.current = true;
    setKeepPromptOpen(true);
  };

  const cancelKeep = () => {
    setKeepPromptOpen(false);
    actionInFlight.current = false;
  };

  const closePreviewInfo = () => {
    setPreviewInfoOpen(false);
    actionInFlight.current = false;
  };

  const closeAlreadyKeepInfo = () => {
    setAlreadyKeepInfoOpen(false);
    actionInFlight.current = false;
  };

  const continueAfterAlreadyKept = async () => {
    setAlreadyKeepInfoOpen(false);
    actionInFlight.current = true;
    try { await advance(); }
    finally { actionInFlight.current = false; }
  };

  const pass = async () => {
    if (!current || processing) return;
    setKeepPromptOpen(false);
    setPreviewInfoOpen(false);
    setAlreadyKeepInfoOpen(false);
    actionInFlight.current = true;
    setProcessing(true);
    try {
      const result = await onPass?.(current);
      if (result !== false) await advance();
    } finally {
      actionInFlight.current = false;
      setProcessing(false);
    }
  };

  const close = async () => {
    setKeepPromptOpen(false);
    setPreviewInfoOpen(false);
    setAlreadyKeepInfoOpen(false);
    actionInFlight.current = true;
    try {
      await stopTrackPreview();
      onClose();
    } finally {
      actionInFlight.current = false;
    }
  };

  const previewLabel = previewResolving
    ? 'Recherche de l’extrait…'
    : resolvedPreviewUrl
      ? 'Lecture automatique'
      : 'Extrait indisponible';

  const swipeHint = previewOnly
    ? 'Aperçu exact de ce que verront tes abonnés · glisse ← pour passer · → pour garder'
    : currentAlreadyKept
      ? 'Déjà dans ton KEEP · aucun doublon possible · glisse ← pour passer'
      : askVisibilityOnKeep
        ? 'Glisse ← pour passer · → pour garder puis choisir profil ou privé'
        : 'Glisse ← pour passer · → pour ajouter à ton KEEP';

  const controlsLocked = processing || keepPromptOpen || previewInfoOpen || alreadyKeepInfoOpen;

  return <Modal visible={visible} animationType="slide" onRequestClose={() => { void close(); }} presentationStyle="fullScreen">
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerText}><Text style={s.eyebrow}>KEEP SWIPE</Text><Text style={s.title}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>
        <TouchableOpacity style={s.close} onPress={() => { void close(); }} accessibilityLabel="Fermer le swipe"><Text style={s.closeText}>✕</Text></TouchableOpacity>
      </View>

      <View style={s.body}>
        {!current ? <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.emptyTitle}>{emptyTitle}</Text><TouchableOpacity style={s.backButton} onPress={() => { void close(); }}><Text style={s.backText}>{resolvedBackLabel}</Text></TouchableOpacity></View> : <>
          <View style={s.deckArea}>
            <SwipeDeck
              resetKey={`${current.id}-${index}`}
              enabled={!controlsLocked}
              onSwipeLeft={() => { void pass(); }}
              onSwipeRight={() => { void requestKeep(); }}
              leftLabel="PASSER"
              rightLabel={currentAlreadyKept ? 'DÉJÀ' : 'KEEP'}
              hint={swipeHint}
            >
              <View style={s.card}>
                {current.artworkUrl ? <Image source={{ uri: current.artworkUrl }} style={s.cover} resizeMode="cover" /> : <View style={[s.cover,s.coverFallback]}><Text style={s.coverK}>K</Text></View>}
                <View style={s.gradientFake}>
                  <View style={s.autoRow}><View style={[s.dot,resolvedPreviewUrl ? s.dotOn : s.dotOff]} /><Text style={s.autoText}>{previewLabel}</Text></View>
                  <Text style={s.trackTitle} numberOfLines={2}>{current.title}</Text>
                  <Text style={s.artist} numberOfLines={1}>{current.artist}</Text>
                  {current.album ? <Text style={s.album} numberOfLines={1}>{current.album}</Text> : null}
                </View>
              </View>
            </SwipeDeck>
          </View>

          <View style={s.decisionBand}>
            <View style={s.decisionRow}>
              <TouchableOpacity style={[s.decisionButton, s.passButton]} onPress={() => { void pass(); }} disabled={controlsLocked} accessibilityLabel="Passer cette musique">
                <Text style={s.passButtonText}>✕ PASSER</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.decisionButton, s.backDecisionButton]} onPress={() => { void close(); }} disabled={controlsLocked} accessibilityLabel={resolvedBackLabel}>
                <Text style={s.backDecisionText}>‹ {resolvedBackLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.decisionButton, s.keepButton, currentAlreadyKept && s.keepButtonAlready]}
                onPress={() => { void requestKeep(); }}
                disabled={controlsLocked}
                accessibilityLabel={currentAlreadyKept ? 'Déjà dans ton KEEP' : 'Garder cette musique'}
              >
                {processing ? <ActivityIndicator color={currentAlreadyKept ? '#B9B0C3' : colors.black} size="small" /> : <Text style={[s.keepButtonText, currentAlreadyKept && s.keepButtonTextAlready]}>{currentAlreadyKept ? '✓ DÉJÀ DANS TON KEEP' : '♡ GARDER'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </>}
      </View>

      {!previewOnly ? <Modal visible={keepPromptOpen} transparent animationType="fade" onRequestClose={cancelKeep}>
        <View style={s.keepOverlay}>
          <View style={s.keepPromptCard}>
            <Text style={s.keepPromptEyebrow}>TON KEEP · TA VISIBILITÉ</Text>
            <Text style={s.keepPromptTitle}>Garder ce morceau ?</Text>
            <Text style={s.keepPromptTrack} numberOfLines={2}>{current?.title} · {current?.artist}</Text>
            <Text style={s.keepPromptBody}>Choisis seulement si tu veux vraiment le garder. Rien n’est enregistré tant que tu n’as pas choisi.</Text>

            <TouchableOpacity style={[s.keepChoice, s.keepChoicePublic]} onPress={() => { void confirmKeep('PUBLIC'); }} accessibilityLabel="Visible sur mon profil">
              <Text style={s.keepChoicePublicTitle}>VISIBLE SUR MON PROFIL</Text>
              <Text style={s.keepChoiceText}>Tes abonnés pourront voir ce morceau dans ton univers KEEP.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.keepChoice, s.keepChoicePrivate]} onPress={() => { void confirmKeep('PRIVATE'); }} accessibilityLabel="Garder en privé">
              <Text style={s.keepChoicePrivateTitle}>GARDER EN PRIVÉ</Text>
              <Text style={s.keepChoiceText}>Le morceau reste pour toi et n’apparaît pas sur ton profil public.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.keepCancel} onPress={cancelKeep} accessibilityLabel="Annuler sans garder">
              <Text style={s.keepCancelText}>ANNULER — NE RIEN GARDER</Text>
            </TouchableOpacity>
            <Text style={s.keepCancelHint}>Si ce morceau ne t’intéresse pas, ferme cette fenêtre puis choisis PASSER.</Text>
          </View>
        </View>
      </Modal> : null}

      {!previewOnly ? <Modal visible={alreadyKeepInfoOpen} transparent animationType="fade" onRequestClose={closeAlreadyKeepInfo}>
        <View style={s.keepOverlay}>
          <View style={s.ownerPreviewCard}>
            <Text style={s.alreadyKeepEyebrow}>DOUBLON BLOQUÉ</Text>
            <Text style={s.ownerPreviewTitle}>Déjà dans ton KEEP</Text>
            <Text style={s.ownerPreviewTrack} numberOfLines={2}>{current?.title} · {current?.artist}</Text>
            <Text style={s.ownerPreviewBody}>Tu as déjà gardé ce morceau. KEEP ne le rajoute pas une deuxième fois et n’ouvre pas le choix Public/Privé.</Text>
            <View style={s.alreadyKeepRule}>
              <Text style={s.alreadyKeepRuleTitle}>Aucune action supplémentaire</Text>
              <Text style={s.ownerPreviewRuleText}>Ton morceau existant reste exactement comme il est dans ton KEEP.</Text>
            </View>
            <TouchableOpacity style={s.alreadyKeepNext} onPress={() => { void continueAfterAlreadyKept(); }} accessibilityLabel="Passer au morceau suivant"><Text style={s.alreadyKeepNextText}>MORCEAU SUIVANT ›</Text></TouchableOpacity>
            <TouchableOpacity style={s.alreadyKeepStay} onPress={closeAlreadyKeepInfo}><Text style={s.alreadyKeepStayText}>RESTER SUR CE MORCEAU</Text></TouchableOpacity>
          </View>
        </View>
      </Modal> : null}

      {previewOnly ? <Modal visible={previewInfoOpen} transparent animationType="fade" onRequestClose={closePreviewInfo}>
        <View style={s.keepOverlay}>
          <View style={s.ownerPreviewCard}>
            <Text style={s.ownerPreviewEyebrow}>APERÇU DE TON PROFIL</Text>
            <Text style={s.ownerPreviewTitle}>Déjà dans ton KEEP</Text>
            <Text style={s.ownerPreviewTrack} numberOfLines={2}>{current?.title} · {current?.artist}</Text>
            <Text style={s.ownerPreviewBody}>Tu possèdes déjà ce morceau. Le bouton GARDER est ici pour te montrer exactement ce que verront tes abonnés.</Text>
            <View style={s.ownerPreviewRule}>
              <Text style={s.ownerPreviewRuleTitle}>Pour un abonné</Text>
              <Text style={s.ownerPreviewRuleText}>GARDER ajoute le morceau à son KEEP, puis il choisit « Visible sur mon profil » ou « Garder en privé ».</Text>
            </View>
            <TouchableOpacity style={s.ownerPreviewOk} onPress={closePreviewInfo}><Text style={s.ownerPreviewOkText}>COMPRIS</Text></TouchableOpacity>
            <Text style={s.ownerPreviewHint}>Cette fonction est destinée à tes abonnés.</Text>
          </View>
        </View>
      </Modal> : null}
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#090610'},
  header:{minHeight:78,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#241A32'},
  headerText:{flex:1,paddingRight:12},eyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:'#F8F6FC',fontSize:20,fontWeight:'900',marginTop:2},subtitle:{color:'#8F879D',fontSize:10,marginTop:3},
  close:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#171020',borderWidth:1,borderColor:'#312348'},closeText:{color:'#FFF',fontSize:18,fontWeight:'900'},
  body:{flex:1,paddingHorizontal:18},deckArea:{flex:1,justifyContent:'center',paddingBottom:10},
  card:{height:500,maxHeight:'70%',borderRadius:28,overflow:'hidden',backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end'},
  cover:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},coverFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#241936'},coverK:{color:colors.primaryLight,fontSize:72,fontWeight:'900',letterSpacing:6},
  gradientFake:{padding:20,paddingTop:90,backgroundColor:'rgba(9,6,16,.68)'},autoRow:{flexDirection:'row',alignItems:'center',marginBottom:8},dot:{width:8,height:8,borderRadius:4,marginRight:6},dotOn:{backgroundColor:'#68F2B1'},dotOff:{backgroundColor:'#756B84'},autoText:{color:'#D3C9DE',fontSize:10,fontWeight:'800'},trackTitle:{color:'#FFF',fontSize:28,lineHeight:32,fontWeight:'900'},artist:{color:'#F0EAF7',fontSize:16,fontWeight:'800',marginTop:6},album:{color:'#A99DB9',fontSize:12,marginTop:3},
  decisionBand:{marginHorizontal:-18,backgroundColor:'#050408',borderTopWidth:1,borderTopColor:'#211A2B',paddingHorizontal:18,paddingTop:10,paddingBottom:12},decisionRow:{flexDirection:'row',alignItems:'stretch',gap:7},decisionButton:{flex:1,minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:5,borderWidth:1},passButton:{backgroundColor:colors.pass,borderColor:colors.pass},passButtonText:{color:colors.white,fontSize:9,fontWeight:'900'},backDecisionButton:{backgroundColor:'#171020',borderColor:'#5B3F8C'},backDecisionText:{color:'#CDB7F4',fontSize:8,fontWeight:'900',textAlign:'center'},keepButton:{backgroundColor:colors.keep,borderColor:colors.keep},keepButtonText:{color:colors.black,fontSize:9,fontWeight:'900',textAlign:'center'},keepButtonAlready:{backgroundColor:'#27222E',borderColor:'#5C5468'},keepButtonTextAlready:{color:'#B9B0C3',fontSize:7.5},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:24},emptyIcon:{fontSize:48,color:colors.primaryLight},emptyTitle:{color:'#F8F6FC',fontSize:16,fontWeight:'900',marginTop:10,textAlign:'center'},backButton:{marginTop:18,minHeight:46,paddingHorizontal:22,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},backText:{color:'#FFF',fontWeight:'900',fontSize:11},
  keepOverlay:{flex:1,backgroundColor:'rgba(4,3,8,.82)',alignItems:'center',justifyContent:'center',paddingHorizontal:22},
  keepPromptCard:{width:'100%',maxWidth:390,borderRadius:26,backgroundColor:'#151020',borderWidth:1,borderColor:'#6E4BA3',padding:20,shadowColor:'#000',shadowOpacity:.42,shadowRadius:22,shadowOffset:{width:0,height:10},elevation:16},
  keepPromptEyebrow:{color:'#B79CFF',fontSize:9,fontWeight:'900',letterSpacing:1.3,textAlign:'center'},keepPromptTitle:{color:'#FFF',fontSize:22,fontWeight:'900',textAlign:'center',marginTop:6},keepPromptTrack:{color:'#D8CFE3',fontSize:12,fontWeight:'800',textAlign:'center',marginTop:5},keepPromptBody:{color:'#9E94AA',fontSize:11,lineHeight:16,textAlign:'center',marginTop:10,marginBottom:14},
  keepChoice:{minHeight:70,borderRadius:17,paddingHorizontal:15,paddingVertical:12,justifyContent:'center',marginTop:9,borderWidth:1},keepChoicePublic:{backgroundColor:'rgba(104,242,177,.12)',borderColor:'#68F2B1'},keepChoicePrivate:{backgroundColor:'#21182F',borderColor:'#5B3F8C'},keepChoicePublicTitle:{color:'#68F2B1',fontSize:11,fontWeight:'900'},keepChoicePrivateTitle:{color:'#D6C2FA',fontSize:11,fontWeight:'900'},keepChoiceText:{color:'#B8AFBF',fontSize:10,lineHeight:14,marginTop:3},
  keepCancel:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:12,borderRadius:14,borderWidth:1,borderColor:'#57313C',backgroundColor:'#1C1117'},keepCancelText:{color:'#FF8AA3',fontSize:10,fontWeight:'900'},keepCancelHint:{color:'#756D80',fontSize:9,lineHeight:13,textAlign:'center',marginTop:7},
  ownerPreviewCard:{width:'100%',maxWidth:350,borderRadius:22,backgroundColor:'#151020',borderWidth:1,borderColor:'#6E4BA3',padding:18,shadowColor:'#000',shadowOpacity:.42,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:14},
  ownerPreviewEyebrow:{color:'#B79CFF',fontSize:8,fontWeight:'900',letterSpacing:1.2,textAlign:'center'},ownerPreviewTitle:{color:'#FFF',fontSize:19,fontWeight:'900',textAlign:'center',marginTop:5},ownerPreviewTrack:{color:'#D8CFE3',fontSize:11,fontWeight:'800',textAlign:'center',marginTop:5},ownerPreviewBody:{color:'#A69CAD',fontSize:10,lineHeight:15,textAlign:'center',marginTop:9},ownerPreviewRule:{marginTop:12,borderRadius:14,backgroundColor:'rgba(104,242,177,.08)',borderWidth:1,borderColor:'rgba(104,242,177,.34)',padding:11},ownerPreviewRuleTitle:{color:'#68F2B1',fontSize:10,fontWeight:'900'},ownerPreviewRuleText:{color:'#B8AFBF',fontSize:9,lineHeight:14,marginTop:3},ownerPreviewOk:{minHeight:42,borderRadius:21,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:13},ownerPreviewOkText:{color:'#FFF',fontSize:10,fontWeight:'900'},ownerPreviewHint:{color:'#756D80',fontSize:8,textAlign:'center',marginTop:7},
  alreadyKeepEyebrow:{color:'#AFA6BD',fontSize:8,fontWeight:'900',letterSpacing:1.2,textAlign:'center'},alreadyKeepRule:{marginTop:12,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#4A4254',padding:11},alreadyKeepRuleTitle:{color:'#D8D0E2',fontSize:10,fontWeight:'900'},alreadyKeepNext:{minHeight:44,borderRadius:22,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',marginTop:13},alreadyKeepNextText:{color:'#FFF',fontSize:10,fontWeight:'900'},alreadyKeepStay:{minHeight:38,alignItems:'center',justifyContent:'center',marginTop:4},alreadyKeepStayText:{color:'#AFA6BD',fontSize:9,fontWeight:'800'},
});