import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import MyMusicScreen from '../screens/MyMusicScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

/**
 * Navigation principale — 4 sections (cahier des charges §32) :
 * ÉCOUTER / DÉCOUVRIR / MES MUSIQUES / PROFIL. Le bouton GARDER reste au
 * cœur de l'onglet ÉCOUTER, pas une 5e destination séparée.
 */
export default function Navigation() {
  const { t } = useTranslation();

  return (
    <NavigationContainer>
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
          options={{ tabBarLabel: t('nav.listen'), tabBarIcon: ({ color }) => <TabIcon icon="🎵" color={color} /> }}
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
    </NavigationContainer>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}
