import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import MusicTasteQuestionnaire from '../../components/MusicTasteQuestionnaire';
import { colors } from '../../theme/colors';

type Props = {
  onDone: () => void;
  onSkip: () => void;
};

export default function OnboardingGenresScreen({ onDone, onSkip }: Props) {
  return (
    <SafeAreaView style={s.container}>
      <MusicTasteQuestionnaire compact onDone={onDone} onLater={onSkip} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
