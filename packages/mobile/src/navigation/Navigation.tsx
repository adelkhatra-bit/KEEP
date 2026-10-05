import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, getStateFromPath } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import HomeScreenCompact from '../screens/HomeScreenCompact';
import DiscoverScreen from '../screens/DiscoverScreen';
import MyMusicScreen from '../screens/MyMusicScreen';
import PartiesScreen from '../screens/PartiesScreen';
import ProfilePublicScreen from '../screens/ProfilePublicScreen';
import PublicUserProfileScreen from '../screens/PublicUserProfileScreen';
import ProfileSettingsMobileScreen from '../screens/ProfileSettingsMobileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SessionRecapScreen from '../screens/SessionRecapScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import AppleMusicConnectScreen from '../screens/AppleMusicConnectScreen';
import MusicConnectionsScreen from '../screens/MusicConnectionsScreen';
import OffersScreen from '../screens/OffersScreen';
import PlaylistSalePanel from '../components/PlaylistSalePanel';
import PlaylistSaleHistoryScreen from '../screens/PlaylistSaleHistoryScreen';
import { useGameSessionStore } from '../store/useGameSessionStore';
import { confirmLeaveGame } from '../services/gameExitGuard';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const linking = {
  // Le sous-chemin GitHub Pages appartient au prefix, pas a `config.path`.
  // React Navigation v6 refuse `path` a la racine de config et plantait le
  // runtime avant le premier rendu (page blanche). Aucun rendu/onglet ne change.
  prefixes: ['keep://', 'https://adelkhatra-bit.github.io/KEEP'],
  config: {
    screens: {
      Main: {
        path: 'Main',
        screens: {
          Listen: 'Listen',
          Discover: 'Discover',
          MyMusic: 'MyMusic',
          Parties: 'Parties',
          Profile: 'Profile',
        },
      },
      SessionRecap: 'session-recap',
      SessionHistory: 'session-history',
      ProfileSettings: 'profile-settings',
      PublicProfile: 'profile/:username',
      MusicConnections: 'music-connections',
      Notifications: 'notifications',
      Offers: 'offers',
      PlaylistSale: 'playlist-sale',
      PlaylistSaleHistory: 'playlist-sale-history',
      AppleMusicConnect: 'apple-music-connect',
    },
  },
  // BUG REEL confirme en direct puis dans le code source (31/08/2026) : un
  // chargement plein-page direct sur /Main/Profile, /Main/Parties ou
  // /Main/MyMusic retombait silencieusement sur Listen. Cause exacte trouvee
  // dans node_modules/@react-navigation/native/src/useLinking.tsx (fonction
  // getInitialState, et le handler history.listen pour precedent/suivant) :
  // web calcule `path = location.pathname + location.search` BRUT, sans
  // jamais passer par `prefixes`/extractPathFromURL. Sur un site racine ca
  // marche par hasard (pathname commence deja par /Main/...) ; sous GitHub
  // Pages (/KEEP/...) le premier segment est "KEEP", ne correspond a aucun
  // screen de `config.screens`, getStateFromPath renvoie undefined, et
  // React Navigation retombe sur l'etat initial par defaut (Main -> Listen).
  // La navigation par clic n'est pas touchee car elle ne repasse jamais par
  // ce calcul de path brut. Symetrique au history_guard deja injecte par
  // web-preview-pages.yml qui AJOUTE /KEEP quand React Navigation ECRIT une
  // URL (getPathFromState) ; ici on RETIRE /KEEP quand React Navigation LIT
  // l'URL (getStateFromPath), pour les deux memes raisons.
  getStateFromPath: Platform.OS === 'web'
    ? (path: string, options: any) => getStateFromPath(stripGitHubPagesBasePath(path), options)
    : undefined,
};

const GITHUB_PAGES_BASE_PATH = '/KEEP';

function stripGitHubPagesBasePath(path: string): string {
  if (path === GITHUB_PAGES_BASE_PATH) return '/';
  if (path.startsWith(`${GITHUB_PAGES_BASE_PATH}/`) || path.startsWith(`${GITHUB_PAGES_BASE_PATH}?`)) {
    return path.slice(GITHUB_PAGES_BASE_PATH.length);
  }
  return path;
}

const TAB = {
  bg: '#0E0A14',
  border: '#2B2038',
  // Règle Loki : les libellés inactifs restent blancs pour ne jamais
  // disparaître visuellement sur le fond sombre (jamais de gris fonctionnel).
  // L'onglet actif utilise le violet de marque pour rester identifiable --
  // observation réelle d'Adel (31/08/2026) : les deux couleurs étaient
  // identiques, impossible de savoir sur quel onglet on se trouvait.
  active: colors.primaryLight,
  inactive: '#FFFFFF',
};

function MainTabs() {
  // Bug reel signale par Adel (16/09/2026, test TestFlight sur iPhone reel) :
  // "la barre elle est trop basse elle est un peu cachee avec les rebords de
  // l'iPhone" -- height/paddingBottom fixes ne laissaient aucune place pour
  // la zone de securite (barre d'accueil) des iPhone sans bouton Home. Le
  // simulateur/Android n'a pas cette zone, le bug n'etait donc jamais visible
  // avant un vrai test sur iPhone.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName="Listen"
      // Adel (29/09/2026) : toucher un autre onglet pendant un Solo en cours
      // -> popup « Quitter la partie ? » (la partie est déjà décomptée).
      screenListeners={({ navigation, route }) => ({
        tabPress: (e) => {
          if (!useGameSessionStore.getState().isGameInProgress || route.name === 'Parties') return;
          e.preventDefault();
          confirmLeaveGame(() => navigation.navigate(route.name));
        },
      })}
      screenOptions={{
        tabBarActiveTintColor: TAB.active,
        tabBarInactiveTintColor: TAB.inactive,
        tabBarStyle: {
          backgroundColor: TAB.bg,
          borderTopColor: TAB.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 7,
          display: 'flex',
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Listen"
        component={HomeScreenCompact}
        options={{
          tabBarLabel: 'Loki Music',
          tabBarIcon: ({ color }) => <TabIcon icon="◉" color={color} />,
        }}
      />
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ tabBarLabel: 'Découvertes', tabBarIcon: ({ color }) => <TabIcon icon="♫" color={color} /> }} />
      <Tab.Screen name="MyMusic" component={MyMusicScreen} options={{ tabBarLabel: 'Playlists', tabBarIcon: ({ color }) => <TabIcon icon="☷" color={color} /> }} />
      <Tab.Screen name="Parties" component={PartiesScreen} options={{ tabBarLabel: 'Soirées', tabBarIcon: ({ color }) => <TabIcon icon="♬" color={color} /> }} />
      <Tab.Screen name="Profile" component={ProfilePublicScreen} options={{ tabBarLabel: 'Profil', tabBarIcon: ({ color }) => <TabIcon icon="◯" color={color} /> }} />
    </Tab.Navigator>
  );
}

const TAB_ITEMS: Array<{ name: string; label: string; icon: string }> = [
  { name: 'Listen', label: 'Loki Music', icon: '◉' },
  { name: 'Discover', label: 'Découvertes', icon: '♫' },
  { name: 'MyMusic', label: 'Playlists', icon: '☷' },
  { name: 'Parties', label: 'Soirées', icon: '♬' },
  { name: 'Profile', label: 'Profil', icon: '◯' },
];

/**
 * Barre des 5 onglets TOUJOURS visible (Adel, 05/10/2026 : « la barre de tâche est visible tout le temps, très important »).
 * Les écrans empilés hors des onglets (Mes sessions, Notifications, Offres, Réglages, profil d'un membre…) cachaient la barre ;
 * on la remet sous eux, identique à celle des onglets, et un appui revient à l'onglet choisi (garde « Quitter la partie ? » comprise).
 */
function PersistentTabBar() {
  const insets = useSafeAreaInsets();
  const [rootRoute, setRootRoute] = React.useState<string>('Main');
  React.useEffect(() => {
    const read = () => setRootRoute(navigationRef.isReady() ? (navigationRef.getRootState()?.routes?.[navigationRef.getRootState().index ?? 0]?.name ?? 'Main') : 'Main');
    read();
    const unsubscribe = navigationRef.addListener('state', read);
    const readyTimer = setTimeout(read, 400);
    return () => { unsubscribe(); clearTimeout(readyTimer); };
  }, []);
  if (rootRoute === 'Main') return null;
  return (
    <View
      testID="persistent-tab-bar"
      style={{ flexDirection: 'row', backgroundColor: TAB.bg, borderTopColor: TAB.border, borderTopWidth: 1, height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom, paddingTop: 7 }}
    >
      {TAB_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.name}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={`Aller à l’onglet ${item.label}`}
          testID={`persistent-tab-${item.name}`}
          onPress={() => {
            if (!navigationRef.isReady()) return;
            const go = () => (navigationRef.navigate as any)('Main', { screen: item.name });
            if (useGameSessionStore.getState().isGameInProgress && item.name !== 'Parties') confirmLeaveGame(go);
            else go();
          }}
        >
          <TabIcon icon={item.icon} color={TAB.inactive} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: TAB.inactive }}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
      <RootStack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen name="SessionRecap" component={SessionRecapScreen} />
        <RootStack.Screen name="SessionHistory" component={SessionHistoryScreen} />
        <RootStack.Screen name="ProfileSettings" component={ProfileSettingsMobileScreen} />
        <RootStack.Screen name="Notifications" component={NotificationsScreen} />
        <RootStack.Screen name="Offers" component={OffersScreen} />
        <RootStack.Screen name="PlaylistSale" component={PlaylistSalePanel} />
        <RootStack.Screen name="PlaylistSaleHistory" component={PlaylistSaleHistoryScreen} />
        <RootStack.Screen name="PublicProfile" component={PublicUserProfileScreen} />
        <RootStack.Screen name="AppleMusicConnect" component={AppleMusicConnectScreen} />
        <RootStack.Screen name="MusicConnections" component={MusicConnectionsScreen} />
      </RootStack.Navigator>
      </View>
      <PersistentTabBar />
      </View>
    </NavigationContainer>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}
