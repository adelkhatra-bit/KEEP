import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import MyMusicScreen from '../screens/MyMusicScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SessionRecapScreen from '../screens/SessionRecapScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import AppleMusicConnectScreen from '../screens/AppleMusicConnectScreen';
import SpotifyConnectScreen from '../screens/SpotifyConnectScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import OffersScreen from '../screens/OffersScreen';
import { colors } from '../theme/colors';

/**
 * Destination UNIQUE de conversion invité -> compte réel (cf. bug réel du
 * 24/08/2026 -- "Créer mon profil" envoyait vers Profil, où un invité ne
 * voyait qu'un bouton Déconnexion, aucun moyen direct de créer un compte).
 * Route accessible depuis n'importe quel écran (HomeScreen, ProfileScreen)
 * -- un seul écran de conversion, jamais une deuxième copie du flux e-mail.
 */
function CreateAccountScreen({ navigation }: any) {
  return <OnboardingScreen initialStep="email" embedded onDone={() => navigation.goBack()} />;
}

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

/**
 * Navigation principale — 4 sections (cahier des charges §32) :
 * SESSION KEEP / DÉCOUVRIR / MES MUSIQUES / PROFIL. Le récapitulatif de
 * session et l'historique des sessions sont poussés au-dessus des onglets
 * (pas une 5e destination de tab bar), depuis l'onglet Session KEEP.
 */
function MainTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.backgroundElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Listen"
        component={HomeScreen}
        options={{ tabBarLabel: t('nav.listen'), tabBarIcon: ({ color }) => <TabIcon icon="🎙️" color={color} /> }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{ tabBarLabel: t('nav.discover'), tabBarIcon: ({ color }) => <TabIcon icon="🧭" color={color} /> }}
      />
      <Tab.Screen
        name="MyMusic"
        component={MyMusicScreen}
        options={{ tabBarLabel: t('nav.myMusic'), tabBarIcon: ({ color }) => <TabIcon icon="📋" color={color} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: t('nav.profile'), tabBarIcon: ({ color }) => <TabIcon icon="👤" color={color} /> }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen name="SessionRecap" component={SessionRecapScreen} />
        <RootStack.Screen name="SessionHistory" component={SessionHistoryScreen} />
        <RootStack.Screen name="AppleMusicConnect" component={AppleMusicConnectScreen} />
        <RootStack.Screen name="SpotifyConnect" component={SpotifyConnectScreen} />
        <RootStack.Screen name="CreateAccount" component={CreateAccountScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="Offers" component={OffersScreen} options={{ presentation: 'modal' }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}
