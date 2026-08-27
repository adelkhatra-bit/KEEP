import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';

const SESSION_OWNER_KEY = '@keep/session-history-owner-v1';

/**
 * Empêche qu'un appareil/browser réutilise l'historique musical d'un autre
 * compte KEEP. Un compte existant qui se connecte repart de son historique
 * cloud. Lors de la création d'un compte depuis un essai local, on conserve
 * volontairement les morceaux de cet essai et on rattache simplement le
 * stockage local au nouvel auth.uid().
 */
export async function bindSessionHistoryToAccount(userId: string, preserveCurrent: boolean): Promise<void> {
  const cleanId = userId.trim();
  if (!cleanId) return;

  let previousOwner: string | null = null;
  try {
    previousOwner = await AsyncStorage.getItem(SESSION_OWNER_KEY);
  } catch {
    previousOwner = null;
  }

  if (previousOwner !== cleanId && !preserveCurrent) {
    useSessionHistoryStore.getState().clearSessions();
  }

  try {
    await AsyncStorage.setItem(SESSION_OWNER_KEY, cleanId);
  } catch {
    // L'isolation mémoire reste appliquée même si le marqueur persistant échoue.
  }
}

/**
 * À la déconnexion on supprime uniquement l'historique local du compte actif.
 * Les KEEP déjà persistés dans Supabase restent intacts et seront rechargés à
 * la prochaine connexion du même utilisateur.
 */
export async function clearLocalSessionHistoryOwnership(): Promise<void> {
  useSessionHistoryStore.getState().clearSessions();
  try {
    await AsyncStorage.removeItem(SESSION_OWNER_KEY);
  } catch {
    // Rien d'autre à faire : le store en mémoire est déjà nettoyé.
  }
}
