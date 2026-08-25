import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import MyMusicScreen from '../screens/MyMusicScreen';
import ProfilePublicScreen from '../screens/ProfilePublicScreen';
import PublicUserProfileScreen from '../screens/PublicUserProfileScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SessionRecapScreen from '../screens/SessionRecapScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import AppleMusicConnectScreen from '../screens/AppleMusicConnectScreen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const linking = {
  prefixes: ['keep://'],
  config: {
    screens: {
      PublicProfile: 'profile/:username',
    },
  },
};

/**
 * Navigation principale — 4 sections (cahier des charges §32) :
 * SESSION KEEP / DÉCOUVRIR / MES MUSIQUES / PROFIL. Le profil public est
 * l'écran principal. L'ancien ProfileScreen reste accessible comme écran
 * de réglages afin de ne perdre aucune fonction déjà construite.
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
        component={ProfilePublicScreen}
        options={{ tabBarLabel: t('nav.profile'), tabBarIcon: ({ color }) => <TabIcon icon="👤" color={color} /> }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer linking={linking}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen name="SessionRecap" component={SessionRecapScreen} />
        <RootStack.Screen name="SessionHistory" component={SessionHistoryScreen} />
        <RootStack.Screen name="ProfileSettings" component={ProfileScreen} />
        <RootStack.Screen name="PublicProfile" component={PublicUserProfileScreen} />
        <RootStack.Screen name="AppleMusicConnect" component={AppleMusicConnectScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}
