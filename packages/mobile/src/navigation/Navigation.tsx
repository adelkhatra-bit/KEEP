import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreenCompact from '../screens/HomeScreenCompact';
import DiscoverScreen from '../screens/DiscoverScreen';
import MyMusicScreen from '../screens/MyMusicScreen';
import PartiesScreen from '../screens/PartiesScreen';
import ProfilePublicScreen from '../screens/ProfilePublicScreen';
import PublicUserProfileScreen from '../screens/PublicUserProfileScreen';
import ProfileSettingsMobileScreen from '../screens/ProfileSettingsMobileScreen';
import AdvancedProfileSettingsScreen from '../screens/AdvancedProfileSettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SessionRecapScreen from '../screens/SessionRecapScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import AppleMusicConnectScreen from '../screens/AppleMusicConnectScreen';
import MusicConnectionsScreen from '../screens/MusicConnectionsScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const linking = {
  prefixes: ['keep://'],
  config: {
    screens: {
      PublicProfile: 'profile/:username',
      MusicConnections: 'music-connections',
      Notifications: 'notifications',
    },
  },
};

const TAB = {
  bg: '#0E0A14',
  border: '#2B2038',
  active: '#A884FA',
  inactive: '#756B84',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: TAB.active,
        tabBarInactiveTintColor: TAB.inactive,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: TAB.bg,
          borderTopColor: TAB.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 5,
          paddingTop: 5,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        headerShown: false,
      }}
    >
      <Tab.Screen name="Listen" component={HomeScreenCompact} options={{ tabBarLabel: 'Écouter', tabBarIcon: ({ color }) => <TabIcon icon="◉" color={color} /> }} />
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ tabBarLabel: 'Découvertes', tabBarIcon: ({ color }) => <TabIcon icon="♫" color={color} /> }} />
      <Tab.Screen name="MyMusic" component={MyMusicScreen} options={{ tabBarLabel: 'Playlists', tabBarIcon: ({ color }) => <TabIcon icon="☷" color={color} /> }} />
      <Tab.Screen name="Parties" component={PartiesScreen} options={{ tabBarLabel: 'Soirées', tabBarIcon: ({ color }) => <TabIcon icon="♬" color={color} /> }} />
      <Tab.Screen name="Profile" component={ProfilePublicScreen} options={{ tabBarLabel: 'Profil', tabBarIcon: ({ color }) => <TabIcon icon="◯" color={color} /> }} />
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
        <RootStack.Screen name="ProfileSettings" component={ProfileSettingsMobileScreen} />
        <RootStack.Screen name="AdvancedProfileSettings" component={AdvancedProfileSettingsScreen} />
        <RootStack.Screen name="Notifications" component={NotificationsScreen} />
        <RootStack.Screen name="PublicProfile" component={PublicUserProfileScreen} />
        <RootStack.Screen name="AppleMusicConnect" component={AppleMusicConnectScreen} />
        <RootStack.Screen name="MusicConnections" component={MusicConnectionsScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}
