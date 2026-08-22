import React from 'react';
import { StatusBar } from 'expo-status-bar';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import { useUserStore } from './src/store/useUserStore';
import { useSessionStore } from './src/store/useSessionStore';
import { useSessionHistoryStore } from './src/store/useSessionHistoryStore';
import { colors } from './src/theme/colors';

// __DEV__ uniquement, jamais en build production/TestFlight -- pratique pour
// débugger (console/web) sans dépendre de flux UI natifs (ex. Alert.alert,
// non implémenté par react-native-web).
if (__DEV__) {
  (globalThis as any).__keepStores = { useUserStore, useSessionStore, useSessionHistoryStore };
}

export default function App() {
  const user = useUserStore((s) => s.user);

  return (
    <>
      {user ? <Navigation /> : <OnboardingScreen />}
      <StatusBar style="light" backgroundColor={colors.background} />
    </>
  );
}
