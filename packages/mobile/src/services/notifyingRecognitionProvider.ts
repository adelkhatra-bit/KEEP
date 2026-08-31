import type { MusicRecognitionProvider, RecognitionResult } from '@keep/music';
import { notifyRecognitionOutsideKeep, prepareRecognitionNotifications } from './recognitionNotificationService';

export class NotifyingRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId: string;

  constructor(private readonly inner: MusicRecognitionProvider) {
    this.providerId = `${inner.providerId}:notifying`;
  }

  async recognize(audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    // Premier passage = app encore ouverte : c'est le bon moment pour demander
    // l'autorisation. Ensuite, si l'utilisateur ouvre TikTok ou Snapchat, une
    // reconnaissance réussie peut apparaître comme notification locale.
    void prepareRecognitionNotifications();
    const result = await this.inner.recognize(audioSample);
    if (result) void notifyRecognitionOutsideKeep(result);
    return result;
  }
}
