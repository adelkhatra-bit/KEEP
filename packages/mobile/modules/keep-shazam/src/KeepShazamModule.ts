import { requireOptionalNativeModule } from 'expo-modules-core';

export type KeepShazamMatch = {
  confidence: number;
  title: string;
  artist: string;
  isrc?: string;
  artworkUrl?: string;
  genres?: string[];
  providerIds?: Record<string, string>;
  externalUrls?: Record<string, string>;
  availableOn?: string[];
  recognitionProviderTrackId?: string;
};

export type KeepShazamNativeModule = {
  isAvailable(): boolean;
  recognizeBase64(base64: string): Promise<KeepShazamMatch | null>;
};

export default requireOptionalNativeModule<KeepShazamNativeModule>('KeepShazam');
