import { requireOptionalNativeModule } from 'expo-modules-core';

export type KeepIAPProduct = {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  type: string;
};

export type KeepIAPTransaction = {
  status: 'PURCHASED' | 'RESTORED' | 'PENDING' | 'CANCELLED' | 'UNVERIFIED';
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  purchaseDateMs?: number;
  expirationDateMs?: number | null;
  revocationDateMs?: number | null;
  appAccountToken?: string | null;
  jwsRepresentation?: string;
};

export type KeepIAPNativeModule = {
  isAvailable(): boolean;
  getProducts(productIds: string[]): Promise<KeepIAPProduct[]>;
  purchase(productId: string, appAccountToken?: string | null): Promise<KeepIAPTransaction>;
  currentEntitlements(): Promise<KeepIAPTransaction[]>;
  restorePurchases(): Promise<KeepIAPTransaction[]>;
  finish(transactionId: string): Promise<boolean>;
};

export default requireOptionalNativeModule<KeepIAPNativeModule>('KeepIAP');
