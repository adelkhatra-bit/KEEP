import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabaseClient';
import { prepareStorageImage, storageImageRule, storageImageUploadOptions, versionedPublicUrl } from './storageImageUpload';

async function pickAvatarAsset() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorise l’accès aux photos pour choisir une image de profil.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    // Qualité du sélecteur natif : la photo est affichée en 40-120 px (voir storageImageUpload.ts).
    quality: storageImageRule('avatar').pickerQuality,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0];
}

export async function pickAndUploadAvatar(profileId: string): Promise<string | null> {
  if (!supabase) throw new Error('Supabase indisponible.');

  const asset = await pickAvatarAsset();
  if (!asset) return null;

  // L'avatar d'un essai local reste sur l'appareil. `getUser()` vérifie la
  // session auprès de Supabase au lieu de faire confiance à un ancien token
  // encore présent dans le navigateur après suppression/réinitialisation d'un
  // compte. Cela évite les erreurs Storage/FK vues pendant les tests mobiles.
  const { data: authState, error: authError } = await supabase.auth.getUser();
  if (authError || !authState.user || authState.user.id !== profileId) return asset.uri;

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  // Réduction avant envoi (PC/web) + limite de poids explicite : une photo de
  // profil ne doit plus peser plusieurs Mo pour un affichage de 40-120 px.
  const prepared = await prepareStorageImage(blob, 'avatar', asset.mimeType || blob.type || 'image/jpeg');
  const path = `${profileId}/avatar.${prepared.extension}`;

  const { error } = await supabase.storage.from('avatars').upload(path, prepared.blob, storageImageUploadOptions(prepared));
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return versionedPublicUrl(data.publicUrl);
}
