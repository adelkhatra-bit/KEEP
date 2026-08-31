import { requireOptionalNativeModule } from 'expo-modules-core';

export type KeepBackgroundListeningNativeModule = {
  isSupported(): boolean;
  isRunning(): boolean;
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
};

export default requireOptionalNativeModule<KeepBackgroundListeningNativeModule>('KeepBackgroundListening');
