import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import PlaylistsScreen from '../screens/PlaylistsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export default function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#1DB954',
          tabBarInactiveTintColor: '#666',
          tabBarStyle: {
            backgroundColor: '#0a0a0a',
            borderTopColor: '#222',
            borderTopWidth: 1,
          },
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Listen',
            tabBarIcon: ({ color }) => <TabIcon icon="🎵" color={color} />,
          }}
        />
        <Tab.Screen
          name="Playlists"
          component={PlaylistsScreen}
          options={{
            tabBarLabel: 'Playlists',
            tabBarIcon: ({ color }) => <TabIcon icon="📋" color={color} />,
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarLabel: 'Profile',
            tabBarIcon: ({ color }) => <TabIcon icon="👤" color={color} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}

import { Text } from 'react-native';
