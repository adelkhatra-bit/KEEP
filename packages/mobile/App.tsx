import React from 'react';
import { StatusBar } from 'expo-status-bar';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import { useUserStore } from './src/store/useUserStore';
import { colors } from './src/theme/colors';

export default function App() {
  const user = useUserStore((s) => s.user);

  return (
    <>
      {user ? <Navigation /> : <OnboardingScreen />}
      <StatusBar style="light" backgroundColor={colors.background} />
    </>
  );
}
