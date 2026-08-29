import React from 'react';
import { ActivityIndicator, Alert, Animated, Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import { KeepBattleArenaState, KeepBattleTheme, loadKeepBattleArena, loadKeepBattleThemes, startKeepBattleArena, submitKeepBattleArenaQuizAnswer, subscribeKeepBattleArena } from '../services/keepBattleService';
import { KeepBattleSoloPack, loadKeepBattleSoloPack } from '../services/keepBattleExperienceService';
import { heartbeatSoloBattle, KeepBattleIncomingChallenge, KeepBattleLivePlayer, leaveSoloBattle, loadIncomingBattleChallenges, loadLiveSoloPlayers, loadOutgoingBattleChallenges, respondBattleChallenge, sendBattleChallenge } from '../services/keepBattleLiveService';
import { supabase } from '../services/supabaseClient';

type Props = { enabled: boolean; onOpenProfile: (username: string) => void; onRequireAccount?: () => void; onExit?: () => void };
const ROUND_MS = 8000;
const THEMES: KeepBattleTheme[] = [
  {code:'MIX',label:'Mix'},{code:'RAP_FR',label:'Rap FR'},{code:'RAP_US',label:'Rap US'},{code:'FUNK',label:'Funk'},
  {code:'DISCO',label:'Disco'},{code:'AFRO',label:'Afro'},{code:'ELECTRO',label:'Electro'},{code:'POP',label:'Pop'},
  {code:'RNB',label:'R&B'},{code:'ROCK',label:'Rock'},{code:'LATINO',label:'Latino'},{code:'RAI',label:'Raï'},
];
const wait = (ms:number) => new Promise((resolve)=>setTimeout(resolve,ms));
const initial = (name:string) => (name||'K').replace(/^@/,'').slice(0,1).toUpperCase();
const KEEP_BATTLE_SHARE = 'https://adelkhatra-bit.github.io/KEEP/share-profile/';

export default function KeepBattleMobileGameV2({enabled,onOpenProfile,onRequireAccount,onExit}:Props){
  const [themes,setThemes]=React.useState<KeepBattleTheme[]>(THEMES);
  const [themeCode,setThemeCode]=React.useState('MIX');
  const [solo,setSolo]=React.useState<KeepBattleSoloPack|null>(null);
  const [soloIndex,setSoloIndex]=React.useState(0);
  const [soloAnswer,setSoloAnswer]=React.useState<string|null>(null);
  const [soloScore,setSoloScore]=React.useState(0);
  const [soloStartedAt,setSoloStartedAt]=React.useState(0);
  const [arena,setArena]=React.useState<KeepBattleArenaState|null>(null);
  const [pending,setPending]=React.useState<string|null>(null);
  const [livePlayers,setLivePlayers]=React.useState<KeepBattleLivePlayer[]>([]);
  const [incoming,setIncoming]=React.useState<KeepBattleIncomingChallenge[]>([]);
  const [busy,setBusy]=React.useState(false);
  const [now,setNow]=React.useState(Date.now());
  const [audioFailed,setAudioFailed]=React.useState(false);
  const [handledOutgoingId,setHandledOutgoingId]=React.useState('');
  const pulse=React.useRef(new Animated.Value(1)).current;
  const versusOpacity=React.useRef(new Animated.Value(0)).current;
  const versusScale=React.useRef(new Animated.Value(.72)).current;

  React.useEffect(()=>{void loadKeepBattleThemes().then((rows)=>rows.length&&setThemes(rows)).catch(()=>{});},[]);
  React.useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(id);},[]);
  React.useEffect(()=>()=>{void stopTrackPreview();void leaveSoloBattle().catch(()=>{});},[]);

  const themeLabel=(code:string)=>themes.find((t)=>t.code===code)?.label||code;
  const animateResult=React.useCallback(()=>{pulse.setValue(.95);Animated.spring(pulse,{toValue:1,friction:5,tension:110,useNativeDriver:true}).start();},[pulse]);
  const animateVersus=React.useCallback(()=>{versusOpacity.setValue(0);versusScale.setValue(.72);Animated.sequence([Animated.parallel([Animated.timing(versusOpacity,{toValue:1,duration:160,useNativeDriver:true}),Animated.spring(versusScale,{toValue:1,friction:4,tension:95,useNativeDriver:true})]),Animated.delay(850),Animated.timing(versusOpacity,{toValue:0,duration:180,useNativeDriver:true})]).start();},[versusOpacity,versusScale]);

  const autoplay=React.useCallback(async(key:string,url?:string|null,duration=ROUND_MS)=>{
    if(!url)return;
    setAudioFailed(false);
    try{await playTrackPreviewSegment(key,url,0,duration);}catch{
      await wait(120);
      try{await playTrackPreviewSegment(`${key}:retry1`,url,0,duration);}catch{
        await wait(180);
        try{await playTrackPreviewSegment(`${key}:retry2`,url,0,duration);}catch{setAudioFailed(true);}
      }
    }
  },[]);

  const shareBattleInvite=React.useCallback(async()=>{
    await Share.share({message:`Viens me défier sur KEEP Battle ⚡\n8 secondes · 3 choix · gagne des Free\n${KEEP_BATTLE_SHARE}`});
  },[]);

  const refreshSocial=React.useCallback(async()=>{
    if(!enabled||!solo)return;
    try{
      const [players,inbox,outbox]=await Promise.all([loadLiveSoloPlayers(12),loadIncomingBattleChallenges(),loadOutgoingBattleChallenges()]);
      setLivePlayers(players);setIncoming(inbox);
      const accepted=outbox.find((x)=>x.status==='ACCEPTED'&&x.arenaId);
      if(accepted?.arenaId){await stopTrackPreview();await leaveSoloBattle().catch(()=>{});setSolo(null);setArena(await loadKeepBattleArena(accepted.arenaId));animateVersus();return;}
      const feedback=outbox.find((x)=>(x.status==='DECLINED'||x.status==='EXPIRED')&&x.id!==handledOutgoingId);
      if(feedback){
        setHandledOutgoingId(feedback.id);
        const refused=feedback.status==='DECLINED';
        Alert.alert(
          refused?'Battle refusé':'Invitation expirée',
          refused?`@${feedback.username} a refusé le Battle. Invite un autre utilisateur ou partage KEEP à un ami.`:`@${feedback.username} n’a pas répondu à temps. Invite un autre utilisateur ou partage KEEP à un ami.`,
          [
            {text:'Continuer',style:'cancel'},
            {text:'Inviter un ami',onPress:()=>{void shareBattleInvite();}},
          ],
        );
      }
    }catch{}
  },[enabled,solo,animateVersus,handledOutgoingId,shareBattleInvite]);

  React.useEffect(()=>{
    if(!enabled||!solo||arena)return undefined;
    let alive=true;
    const tick=async()=>{if(!alive)return;await heartbeatSoloBattle(solo.themeCode).catch(()=>{});await refreshSocial();};
    void tick();const id=setInterval(()=>void tick(),650);
    return()=>{alive=false;clearInterval(id);void leaveSoloBattle().catch(()=>{});};
  },[enabled,solo?.themeCode,arena?.id,refreshSocial]);

  React.useEffect(()=>{
    const round=solo?.rounds[soloIndex];if(!round)return;
    setSoloStartedAt(Date.now());setAudioFailed(false);
    void autoplay(`solo:${round.trackId}:${soloIndex}`,round.previewUrl,ROUND_MS);
  },[solo?.themeCode,soloIndex,autoplay]);

  const soloRemaining=soloStartedAt?Math.max(0,ROUND_MS-(now-soloStartedAt)):ROUND_MS;
  React.useEffect(()=>{
    if(!solo||soloAnswer||soloRemaining>0)return;
    setSoloAnswer('__TIMEOUT__');void stopTrackPreview();animateResult();
  },[solo,soloAnswer,soloRemaining,animateResult]);

  React.useEffect(()=>{
    if(!solo||!soloAnswer||soloIndex>=solo.rounds.length-1)return undefined;
    const id=setTimeout(()=>{setSoloIndex((v)=>v+1);setSoloAnswer(null);},850);return()=>clearTimeout(id);
  },[solo,soloAnswer,soloIndex]);

  const refreshArena=React.useCallback(async()=>{if(!arena?.id)return;try{setArena(await loadKeepBattleArena(arena.id));}catch{}},[arena?.id]);
  React.useEffect(()=>{if(!arena?.id)return undefined;const off=subscribeKeepBattleArena(arena.id,()=>void refreshArena());const id=setInterval(()=>void refreshArena(),300);return()=>{off();clearInterval(id);};},[arena?.id,refreshArena]);

  React.useEffect(()=>{
    const round=arena?.round;if(!arena||arena.status!=='ACTIVE'||!round?.previewUrl)return;
    const closesAt=round.closesAt?new Date(round.closesAt).getTime():Date.now()+ROUND_MS;
    const duration=Math.max(1200,closesAt-Date.now());
    setAudioFailed(false);void autoplay(`arena:${arena.id}:${arena.matchNo}:${round.position}`,round.previewUrl,duration);
  },[arena?.id,arena?.status,arena?.matchNo,arena?.round?.position,arena?.round?.previewUrl,arena?.round?.closesAt,autoplay]);
  React.useEffect(()=>{if(!arena?.round?.revealed)return;void stopTrackPreview();animateResult();},[arena?.round?.revealed,arena?.round?.position,arena?.matchNo,animateResult]);

  React.useEffect(()=>{
    if(!arena||arena.status!=='WAITING'||!arena.isHost||arena.seats.length<2)return undefined;
    const id=setTimeout(()=>void startKeepBattleArena(arena.id).then((a)=>{setArena(a);animateVersus();}).catch(()=>{}),2000);
    return()=>clearTimeout(id);
  },[arena?.id,arena?.status,arena?.isHost,arena?.matchNo,arena?.seats.length,animateVersus]);

  const startSolo=async()=>{if(busy)return;setBusy(true);try{const p=await loadKeepBattleSoloPack(themeCode,8);setArena(null);setSolo(p);setSoloIndex(0);setSoloAnswer(null);setSoloScore(0);setSoloStartedAt(Date.now());setHandledOutgoingId('');}catch(e:any){Alert.alert('KEEP Battle',String(e?.message||'Impossible de démarrer.'));}finally{setBusy(false);}};
  const startOnline=async()=>{if(!enabled||!supabase){onRequireAccount?.();return;}setBusy(true);try{const {data,error}=await supabase.rpc('keep_battle_arena_matchmake',{p_theme_code:themeCode});if(error)throw error;const id=String((data as any)?.id||'');if(!id)throw new Error('Salon introuvable');await leaveSoloBattle().catch(()=>{});setSolo(null);setArena(await loadKeepBattleArena(id));}catch(e:any){Alert.alert('KEEP Battle',String(e?.message||'Impossible de rejoindre un salon.'));}finally{setBusy(false);}};

  const answerSolo=(choice:string)=>{const r=solo?.rounds[soloIndex];if(!r||soloAnswer||soloRemaining<=0)return;void stopTrackPreview();setSoloAnswer(choice);if(choice===r.correctAnswer)setSoloScore((v)=>v+1);animateResult();};
  const answerArena=async(choice:string)=>{
    if(!arena||arena.status!=='ACTIVE'||arena.round?.answered||arena.round?.revealed||pending)return;
    const startsAt=arena.round?.startedAt?new Date(arena.round.startedAt).getTime():0;
    const closesAt=arena.round?.closesAt?new Date(arena.round.closesAt).getTime():0;
    if((startsAt&&Date.now()<startsAt)||(closesAt&&Date.now()>=closesAt))return;
    void stopTrackPreview();setPending(choice);
    try{setArena(await submitKeepBattleArenaQuizAnswer(arena.id,choice));}catch{}finally{setPending(null);}
  };
  const challenge=async(p:KeepBattleLivePlayer)=>{try{const sent=await sendBattleChallenge(p.profileId,solo?.themeCode||themeCode);setHandledOutgoingId('');Alert.alert('Défi envoyé',`@${p.username} a 15 secondes pour accepter.`);if(!sent.id)void refreshSocial();}catch{Alert.alert('Battle',`@${p.username} n’est plus disponible.`);void refreshSocial();}};
  const respond=async(item:KeepBattleIncomingChallenge,accept:boolean)=>{try{const r=await respondBattleChallenge(item.id,accept);setIncoming((rows)=>rows.filter((x)=>x.id!==item.id));if(accept&&r.arenaId){await stopTrackPreview();await leaveSoloBattle().catch(()=>{});setSolo(null);setArena(await loadKeepBattleArena(r.arenaId));animateVersus();}}catch{Alert.alert('Battle','Cette invitation a expiré.');}};

  const Avatar=({name,url,size=48}:{name:string;url?:string|null;size?:number})=>url?<Image source={{uri:url}} style={{width:size,height:size,borderRadius:size/2}}/>:<View style={[s.avatarFallback,{width:size,height:size,borderRadius:size/2}]}><Text style={s.avatarLetter}>{initial(name)}</Text></View>;

  if(solo){
    const r=solo.rounds[soloIndex];const timeout=soloAnswer==='__TIMEOUT__';const answered=Boolean(soloAnswer);const correct=!timeout&&soloAnswer===r.correctAnswer;const finished=answered&&soloIndex===solo.rounds.length-1;const pct=(soloRemaining/ROUND_MS)*100;
    const challengeRemaining=incoming[0]?Math.max(0,Math.ceil((new Date(incoming[0].expiresAt).getTime()-now)/1000)):0;
    const attempts=soloIndex+(answered?1:0);const errors=Math.max(0,attempts-soloScore);const remaining=Math.max(0,solo.rounds.length-attempts);
    return <View style={s.root}>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={()=>{setSolo(null);void stopTrackPreview();void leaveSoloBattle().catch(()=>{});}}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE</Text><Text style={s.title}>{themeLabel(solo.themeCode)}</Text></View><Text style={s.round}>{soloIndex+1}/8</Text></View>
      <View style={s.clockRow}><Text style={[s.clock,soloRemaining<1800&&s.clockHot]}>{(soloRemaining/1000).toFixed(1)}s</Text><Text style={s.clockHint}>RÉPONDS VITE</Text></View>
      <View style={s.timeTrack}><View style={[s.timeFill,{width:`${pct}%`}]} /></View>
      <Animated.View style={[s.card,{transform:[{scale:pulse}]}]}><View style={s.visual}>{answered&&r.artworkUrl?<Image source={{uri:r.artworkUrl}} style={s.cover}/>:<Text style={s.music}>♫</Text>}{answered?<View style={s.result}><Text style={correct?s.good:s.bad}>{correct?'GAGNÉ !':timeout?'OUPS · TROP TARD':'PERDU'}</Text><Text style={s.artist}>{r.artist}</Text></View>:null}{audioFailed?<View style={s.audioState}><Text style={s.audioStateText}>AUDIO EN RECONNEXION…</Text></View>:null}</View><Text style={s.question}>Qui chante ?</Text><View style={s.answers}>{r.choices.slice(0,3).map((choice,i)=><TouchableOpacity key={choice} disabled={answered} onPress={()=>answerSolo(choice)} style={[s.answer,answered&&choice===r.correctAnswer&&s.answerCorrect]}><Text style={s.answerNo}>{i+1}</Text><Text style={s.answerText}>{choice}</Text></TouchableOpacity>)}</View></Animated.View>
      <View style={s.scoreLine}><Text style={s.score}>✓ {soloScore} bonne{soloScore>1?'s':''} · ✕ {errors} erreur{errors>1?'s':''}</Text><Text style={s.score}>{remaining} à jouer</Text></View>
      {enabled?<View style={s.live}><View style={s.liveHeader}><View style={s.dot}/><Text style={s.liveTitle}>{livePlayers.length?`${livePlayers.length} joueur${livePlayers.length>1?'s':''} joue${livePlayers.length>1?'nt':''} solo`:'Tu es visible en solo'}</Text></View>{livePlayers.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveRow}>{livePlayers.map((p)=><View key={p.profileId} style={s.livePlayer}><TouchableOpacity onPress={()=>onOpenProfile(p.username)}><Avatar name={p.username} url={p.avatarUrl}/></TouchableOpacity><Text numberOfLines={1} style={s.username}>@{p.username}</Text><TouchableOpacity style={s.battleButton} onPress={()=>void challenge(p)}><Text style={s.battleButtonText}>BATTLE ?</Text></TouchableOpacity></View>)}</ScrollView>:null}</View>:null}
      {incoming[0]?<Animated.View style={[s.invite,{transform:[{scale:pulse}]}]}><View style={s.inviteTop}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={58}/><View style={{flex:1}}><Text style={s.inviteLabel}>⚡ DÉFI EN DIRECT · {challengeRemaining}s</Text><TouchableOpacity onPress={()=>onOpenProfile(incoming[0].username)}><Text style={s.inviteName}>@{incoming[0].username}</Text></TouchableOpacity><Text style={s.inviteQuestion}>Souhaites-tu jouer à un Battle afin de gagner des Free ?</Text></View></View><View style={s.inviteActions}><TouchableOpacity style={s.no} onPress={()=>void respond(incoming[0],false)}><Text style={s.noText}>NON</Text></TouchableOpacity><TouchableOpacity style={s.yes} onPress={()=>void respond(incoming[0],true)}><Text style={s.yesText}>OUI · BATTLE</Text></TouchableOpacity></View></Animated.View>:null}
      {finished?<TouchableOpacity style={s.mainButton} onPress={()=>void startSolo()}><Text style={s.mainButtonText}>REJOUER</Text></TouchableOpacity>:null}
    </View>;
  }

  if(arena){
    const r=arena.round;const players=(arena.leaderboard?.length?arena.leaderboard.map((l)=>arena.seats.find((x)=>x.profileId===l.profileId)||({...l,avatarUrl:null,followers:0,favoriteGenres:[],favoriteArtists:[],isHost:false} as any)):arena.seats)||[];
    const startsAt=r?.startedAt?new Date(r.startedAt).getTime():0;
    const closesAt=r?.closesAt?new Date(r.closesAt).getTime():0;
    const ready=arena.status==='ACTIVE'&&(!startsAt||now>=startsAt);
    const left=arena.status==='ACTIVE'&&closesAt?Math.max(0,closesAt-Math.max(now,startsAt||now)):ROUND_MS;
    const pct=Math.max(0,Math.min(100,(left/ROUND_MS)*100));
    const first=players[0];const second=players[1];const total=Math.max(1,(first?.score||0)+(second?.score||0));const leftShare=players.length===2?Math.max(12,Math.min(88,((first?.score||0)/total)*100)):50;
    return <View style={s.root}>
      <Animated.View pointerEvents="none" style={[s.versus,{opacity:versusOpacity,transform:[{scale:versusScale}]}]}><Text style={s.versusText}>⚡ BATTLE ⚡</Text><Text style={s.versusNames}>{first?`@${first.username}`:'KEEP'}  VS  {second?`@${second.username}`:'KEEP'}</Text></Animated.View>
      <View style={s.header}><TouchableOpacity style={s.back} onPress={()=>{setArena(null);void stopTrackPreview();}}><Text style={s.backText}>‹</Text></TouchableOpacity><View style={s.headerMid}><Text style={s.kicker}>KEEP BATTLE · {arena.seats.length} JOUEURS</Text><Text style={s.title}>{themeLabel(arena.themeCode)}</Text></View><Text style={s.round}>{arena.currentRound||0}/{arena.roundCount}</Text></View>
      {first&&second?<View style={s.duel}><View style={s.duelNames}><TouchableOpacity style={{flex:1}} onPress={()=>onOpenProfile(first.username)}><Text style={s.duelName}>@{first.username}</Text></TouchableOpacity><Text style={s.duelScore}>{first.score} — {second.score}</Text><TouchableOpacity style={{flex:1}} onPress={()=>onOpenProfile(second.username)}><Text style={[s.duelName,{textAlign:'right'}]}>@{second.username}</Text></TouchableOpacity></View><View style={s.power}><View style={[s.powerLeft,{width:`${leftShare}%`}]} /><View style={s.powerMiddle}/><View style={s.powerRight}/></View></View>:null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.players}>{arena.seats.map((p,i)=><TouchableOpacity key={p.profileId} style={s.player} onPress={()=>onOpenProfile(p.username)}><View style={s.place}><Text style={s.placeText}>{i+1}</Text></View><Avatar name={p.username} url={p.avatarUrl}/><Text style={s.username}>@{p.username}</Text><Text style={s.playerScore}>{p.score} pts</Text></TouchableOpacity>)}</ScrollView>
      {arena.status==='WAITING'?<View style={s.waiting}>{arena.lastWinner?<><Text style={s.trophy}>🏆</Text><Text style={s.winner}>@{arena.lastWinner.username}</Text><Text style={s.winnerSub}>VAINQUEUR · {arena.lastWinner.score} PTS</Text></>:<><Text style={s.trophy}>⚡</Text><Text style={s.winner}>{arena.seats.length<2?'EN ATTENTE':'DUEL EN SYNCHRONISATION'}</Text></>}<Text style={s.waitText}>{arena.seats.length>=2?'Les deux joueurs basculent ensemble. Le Battle démarre automatiquement.':'En attente d’un adversaire.'}</Text></View>:null}
      {arena.status==='ACTIVE'&&r?<><View style={s.clockRow}><Text style={[s.clock,left<1800&&s.clockHot]}>{ready?(left/1000).toFixed(1):'PRÊT'}</Text><Text style={s.clockHint}>{r.answered?'RÉPONSE ENREGISTRÉE':ready?'RÉPONDS VITE':'SON EN CHARGEMENT'}</Text></View><View style={s.timeTrack}><View style={[s.timeFill,{width:`${ready?pct:100}%`}]} /></View><Animated.View style={[s.card,{transform:[{scale:pulse}]}]}><View style={s.visual}>{r.revealed&&r.artworkUrl?<Image source={{uri:r.artworkUrl}} style={s.cover}/>:<Text style={s.music}>♫</Text>}{r.revealed?<View style={s.result}><Text style={r.myAnswer?.correct?s.good:s.bad}>{r.myAnswer?.correct?'GAGNÉ !':r.answered?'PERDU':'OUPS · TROP TARD'}</Text><Text style={s.artist}>{r.artist||''}</Text>{arena.roundWinner?<Text style={s.roundWinner}>⚡ @{arena.roundWinner.username} gagne la manche</Text>:null}</View>:null}{audioFailed?<View style={s.audioState}><Text style={s.audioStateText}>AUDIO EN RECONNEXION…</Text></View>:null}</View><Text style={s.question}>Qui chante ?</Text>{!r.revealed?<View style={s.answers}>{(r.choices||[]).slice(0,3).map((choice,i)=><TouchableOpacity key={choice} disabled={Boolean(!ready||r.answered||pending||left<=0)} onPress={()=>void answerArena(choice)} style={[s.answer,(r.myAnswer?.selectedAnswer===choice||pending===choice)&&s.answerSelected]}><Text style={s.answerNo}>{i+1}</Text><Text style={s.answerText}>{choice}</Text></TouchableOpacity>)}</View>:null}</Animated.View></>:null}
    </View>;
  }

  return <View style={s.root}><View style={s.home}><TouchableOpacity style={s.homeBack} onPress={onExit} accessibilityRole="button" accessibilityLabel="Retour aux soirées"><Text style={s.homeBackText}>‹</Text></TouchableOpacity><Text style={s.homeIcon}>⚡</Text><Text style={s.homeTitle}>KEEP BATTLE</Text><Text style={s.homeSub}>8 secondes. 3 choix. Pas de swipe.</Text></View><Text style={s.section}>STYLE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeRow}>{themes.map((t)=><TouchableOpacity key={t.code} onPress={()=>setThemeCode(t.code)} style={[s.theme,t.code===themeCode&&s.themeOn]}><Text style={[s.themeText,t.code===themeCode&&s.themeTextOn]}>{t.label}</Text></TouchableOpacity>)}</ScrollView><TouchableOpacity style={s.mainButton} disabled={busy} onPress={()=>void startSolo()}>{busy?<ActivityIndicator color="#15110B"/>:<><Text style={s.mainButtonText}>JOUER SOLO</Text><Text style={s.mainButtonSub}>Le son démarre automatiquement</Text></>}</TouchableOpacity><TouchableOpacity style={s.onlineButton} disabled={busy} onPress={()=>void startOnline()}><Text style={s.onlineTitle}>BATTLE EN LIGNE</Text><Text style={s.onlineSub}>Rejoins un groupe ou crée le tien</Text></TouchableOpacity></View>;
}

const s=StyleSheet.create({
  root:{width:'100%',flex:1,paddingBottom:8},home:{alignItems:'center',paddingVertical:14,position:'relative'},homeBack:{position:'absolute',left:0,top:8,width:34,height:34,borderRadius:17,backgroundColor:'#17121D',alignItems:'center',justifyContent:'center',zIndex:3},homeBackText:{color:'#FFF',fontSize:27,lineHeight:29},homeIcon:{fontSize:34},homeTitle:{color:'#FFF',fontSize:28,fontWeight:'900'},homeSub:{color:'#A99BB7',fontSize:12,fontWeight:'700',marginTop:3},section:{color:'#8C7E9A',fontSize:11,fontWeight:'900',letterSpacing:1.2,marginBottom:8},themeRow:{gap:7,paddingRight:16},theme:{minHeight:38,paddingHorizontal:14,borderRadius:19,borderWidth:1,borderColor:'#30273A',backgroundColor:'#17121D',alignItems:'center',justifyContent:'center'},themeOn:{backgroundColor:'#FFF',borderColor:'#FFF'},themeText:{color:'#C6B9D2',fontSize:12,fontWeight:'800'},themeTextOn:{color:'#120E16'},mainButton:{minHeight:58,borderRadius:29,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center',marginTop:16},mainButtonText:{color:'#17130B',fontSize:15,fontWeight:'900'},mainButtonSub:{color:'#494D22',fontSize:10,fontWeight:'800',marginTop:2},onlineButton:{minHeight:64,borderRadius:22,backgroundColor:'#18121F',borderWidth:1,borderColor:'#31263B',alignItems:'center',justifyContent:'center',marginTop:10},onlineTitle:{color:'#FFF',fontSize:14,fontWeight:'900'},onlineSub:{color:'#A99BB7',fontSize:11,fontWeight:'700',marginTop:2},header:{flexDirection:'row',alignItems:'center',marginBottom:6},back:{width:36,height:36,borderRadius:18,backgroundColor:'#17121D',alignItems:'center',justifyContent:'center'},backText:{color:'#FFF',fontSize:27,lineHeight:29},headerMid:{flex:1,alignItems:'center'},kicker:{color:'#9384A2',fontSize:9,fontWeight:'900',letterSpacing:1},title:{color:'#FFF',fontSize:16,fontWeight:'900'},round:{width:40,textAlign:'right',color:'#BFB0CC',fontSize:12,fontWeight:'900'},clockRow:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:3},clock:{color:'#FFF',fontSize:27,fontWeight:'900'},clockHot:{color:'#FF6687'},clockHint:{color:'#B7A8C4',fontSize:9,fontWeight:'900',letterSpacing:1},timeTrack:{height:7,borderRadius:4,overflow:'hidden',backgroundColor:'#211A29',marginVertical:6},timeFill:{height:'100%',backgroundColor:'#E5F266'},card:{borderRadius:27,padding:9,backgroundColor:'#120E17',borderWidth:1,borderColor:'#30263A'},visual:{height:250,borderRadius:21,overflow:'hidden',backgroundColor:'#21192A',alignItems:'center',justifyContent:'center',position:'relative'},cover:{width:'100%',height:'100%'},music:{color:'#FFF',fontSize:82,fontWeight:'900'},result:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(8,6,10,.72)',alignItems:'center',justifyContent:'center',padding:18},good:{color:'#7FF2B7',fontSize:30,fontWeight:'900'},bad:{color:'#FF6C8C',fontSize:27,fontWeight:'900'},artist:{color:'#FFF',fontSize:20,fontWeight:'900',textAlign:'center',marginTop:7},roundWinner:{color:'#FFE193',fontSize:12,fontWeight:'900',textAlign:'center',marginTop:12},audioState:{position:'absolute',left:10,right:10,bottom:10,padding:8,borderRadius:14,backgroundColor:'rgba(10,8,12,.85)'},audioStateText:{color:'#BEB0C9',fontSize:9,fontWeight:'900',textAlign:'center'},question:{color:'#FFF',fontSize:15,fontWeight:'900',textAlign:'center',marginTop:9},answers:{gap:8,marginTop:8},answer:{minHeight:51,borderRadius:17,backgroundColor:'#1D1625',borderWidth:1,borderColor:'#342A40',flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:10},answerSelected:{borderColor:'#E5F266',backgroundColor:'#30351B'},answerCorrect:{borderColor:'#69E5A4'},answerNo:{width:25,height:25,borderRadius:13,backgroundColor:'#2B2235',color:'#FFF',textAlign:'center',lineHeight:25,fontSize:11,fontWeight:'900'},answerText:{flex:1,color:'#FFF',fontSize:14,fontWeight:'900'},scoreLine:{flexDirection:'row',justifyContent:'space-between',marginTop:7,paddingHorizontal:4},score:{color:'#A99BB7',fontSize:11,fontWeight:'800'},live:{marginTop:10,padding:9,borderRadius:19,backgroundColor:'#100D14'},liveHeader:{flexDirection:'row',alignItems:'center',gap:7},dot:{width:8,height:8,borderRadius:4,backgroundColor:'#6EE8A7'},liveTitle:{color:'#FFF',fontSize:11,fontWeight:'900'},liveRow:{gap:12,paddingTop:9},livePlayer:{width:76,alignItems:'center'},avatarFallback:{backgroundColor:'#2B2235',alignItems:'center',justifyContent:'center'},avatarLetter:{color:'#FFF',fontSize:17,fontWeight:'900'},username:{color:'#D8CBDF',fontSize:9,fontWeight:'800',marginTop:4,maxWidth:74},battleButton:{minHeight:28,paddingHorizontal:8,borderRadius:14,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center',marginTop:5},battleButtonText:{color:'#FFF',fontSize:9,fontWeight:'900'},invite:{position:'absolute',zIndex:30,left:8,right:8,top:92,padding:14,borderRadius:23,backgroundColor:'rgba(36,23,48,.98)',borderWidth:1.5,borderColor:'#E5F266',shadowColor:'#000',shadowOpacity:.35,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:12},inviteTop:{flexDirection:'row',alignItems:'center',gap:10},inviteLabel:{color:'#E5F266',fontSize:10,fontWeight:'900'},inviteName:{color:'#FFF',fontSize:18,fontWeight:'900',marginTop:2},inviteQuestion:{color:'#F3EDF7',fontSize:12,lineHeight:17,fontWeight:'800',marginTop:5},inviteActions:{flexDirection:'row',gap:8,marginTop:12},no:{flex:1,minHeight:44,borderRadius:22,borderWidth:1,borderColor:'#4B3C57',alignItems:'center',justifyContent:'center'},noText:{color:'#DDD0E4',fontSize:11,fontWeight:'900'},yes:{flex:1,minHeight:44,borderRadius:22,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},yesText:{color:'#17130B',fontSize:11,fontWeight:'900'},versus:{position:'absolute',zIndex:20,left:20,right:20,top:145,padding:22,borderRadius:28,backgroundColor:'#22152D',borderWidth:1,borderColor:'#8B5CF6',alignItems:'center'},versusText:{color:'#E5F266',fontSize:29,fontWeight:'900'},versusNames:{color:'#FFF',fontSize:14,fontWeight:'900',marginTop:7},duel:{marginBottom:8},duelNames:{flexDirection:'row',alignItems:'center'},duelName:{color:'#FFF',fontSize:11,fontWeight:'900'},duelScore:{color:'#E5F266',fontSize:13,fontWeight:'900'},power:{height:15,borderRadius:8,overflow:'hidden',backgroundColor:'#2A2032',flexDirection:'row',position:'relative',marginTop:6},powerLeft:{height:'100%',backgroundColor:'#8B5CF6'},powerRight:{flex:1,height:'100%',backgroundColor:'#E14E78'},powerMiddle:{position:'absolute',zIndex:3,left:'50%',width:2,height:'100%',backgroundColor:'#FFF'},players:{gap:12,paddingBottom:8},player:{width:72,alignItems:'center',position:'relative'},place:{position:'absolute',zIndex:3,left:0,top:0,width:19,height:19,borderRadius:10,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},placeText:{color:'#17130B',fontSize:9,fontWeight:'900'},playerScore:{color:'#E5F266',fontSize:9,fontWeight:'900',marginTop:1},waiting:{padding:17,borderRadius:25,backgroundColor:'#120E17',borderWidth:1,borderColor:'#30263A',alignItems:'center'},trophy:{fontSize:39},winner:{color:'#FFF',fontSize:23,fontWeight:'900',marginTop:4},winnerSub:{color:'#FFE193',fontSize:11,fontWeight:'900',marginTop:2},waitText:{color:'#A99BB7',fontSize:11,lineHeight:17,textAlign:'center',marginTop:8}
});
