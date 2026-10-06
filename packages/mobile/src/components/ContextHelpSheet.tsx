import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import KeepModal from './KeepModal';

export type ContextHelpStep = {
  title: string;
  text: string;
};

type Props = {
  visible: boolean;
  title: string;
  intro?: string;
  steps: ContextHelpStep[];
  footer?: string | null;
  onClose: () => void;
};

export default function ContextHelpSheet({ visible, title, intro, steps, footer, onClose }: Props) {
  return (
    <KeepModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop} accessibilityViewIsModal>
        <View style={s.card}>
          <View style={s.handle} />
          <View style={s.head}>
            <View style={s.headCopy}>
              <Text style={s.title}>{title}</Text>
              {intro ? <Text style={s.intro}>{intro}</Text> : null}
            </View>
            <TouchableOpacity style={s.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer l’aide">
              <Text style={s.closeText}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.scroll} contentContainerStyle={s.steps} showsVerticalScrollIndicator={false}>
            {steps.map((step, index) => (
              <View key={`${index}-${step.title}`} style={s.step}>
                <Text style={s.no}>{index + 1}</Text>
                <View style={s.copy}>
                  <Text style={s.stepTitle}>{step.title}</Text>
                  <Text style={s.stepText}>{step.text}</Text>
                </View>
              </View>
            ))}
            {footer ? <Text style={s.footer}>{footer}</Text> : null}
          </ScrollView>
          <TouchableOpacity style={s.done} onPress={onClose} accessibilityRole="button" accessibilityLabel="J’ai compris">
            <Text style={s.doneText}>J’AI COMPRIS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeepModal>
  );
}

const s = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.76)',justifyContent:'center',paddingHorizontal:14},
  card:{width:'100%',maxWidth:460,maxHeight:'82%',alignSelf:'center',backgroundColor:colors.backgroundCard,borderRadius:20,borderWidth:1,borderColor:colors.primaryLight,padding:16,shadowColor:'#000',shadowOpacity:.3,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:16},
  handle:{width:42,height:4,borderRadius:2,backgroundColor:colors.border,alignSelf:'center',marginBottom:12},
  head:{flexDirection:'row',alignItems:'flex-start',gap:10},
  headCopy:{flex:1,minWidth:0},
  title:{color:colors.textPrimary,fontSize:19,fontWeight:'900'},
  intro:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:4},
  close:{width:32,height:32,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  closeText:{color:colors.primaryLight,fontSize:20,fontWeight:'900',lineHeight:22},
  scroll:{marginTop:14},
  steps:{gap:9,paddingBottom:4},
  step:{minHeight:56,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  no:{width:28,height:28,borderRadius:14,backgroundColor:colors.primary,color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center',lineHeight:28},
  copy:{flex:1,minWidth:0},
  stepTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  stepText:{color:colors.textMuted,fontSize:10,lineHeight:15,marginTop:2},
  footer:{color:colors.primaryLight,fontSize:11,lineHeight:16,fontWeight:'900',marginTop:4},
  done:{minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},
  doneText:{color:'#FFF',fontSize:11,fontWeight:'900'},
});
