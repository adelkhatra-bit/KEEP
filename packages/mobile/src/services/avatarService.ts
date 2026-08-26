import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabaseClient';

async function pickAvatarAsset() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorise l’accès aux photos pour choisir une image de profil.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.82,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0];
}

export async function pickAndUploadAvatar(profileId: string): Promise<string | null> {
  if (!supabase) throw new Error('Supabase indisponible.');

  const asset = await pickAvatarAsset();
  if (!asset) return null;

  // En essai gratuit il n'y a volontairement aucune session Supabase.
  // On conserve donc l'URI locale sur l'appareil. Lors de la création du vrai
  // compte, guestUpgradeService + profileService la transfèrent dans Storage.
  const { data: authState } = await supabase.auth.getSession();
  if (!authState.session?.user || authState.session.user.id !== profileId) return asset.uri;

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const mime = asset.mimeType || blob.type || 'image/jpeg';
  const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const path = `${profileId}/avatar.${extension}`;

  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: mime,
    cacheControl: '3600',
  });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
