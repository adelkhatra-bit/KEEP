import React from 'react';
import PublicUserProfileScreen from './PublicUserProfileScreen';
import { useUserStore } from '../store/useUserStore';

/**
 * Profil unique Loki Music : propriétaire et visiteur partagent exactement
 * le même rendu. PublicUserProfileScreen adapte seulement les actions selon
 * isOwner, sans dupliquer le design.
 */
export default function ProfilePublicScreen({ navigation, route }: any) {
  const user = useUserStore((state) => state.user);
  const username = user?.username || route?.params?.username;

  return (
    <PublicUserProfileScreen
      navigation={navigation}
      route={{
        ...route,
        params: {
          ...(route?.params || {}),
          username,
          ownerEntry: true,
        },
      }}
    />
  );
}
