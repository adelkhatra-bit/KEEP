import { PipedreamClient } from '@pipedream/sdk';
import { getIntegrationSecret } from './integrationSecrets';

export type PipedreamMusicProvider = 'spotify' | 'youtube_music' | 'soundcloud';

const APP_SLUGS: Record<PipedreamMusicProvider, string> = {
  spotify: 'spotify',
  youtube_music: 'youtube_data_api',
  soundcloud: 'soundcloud',
};

type PipedreamConfig = {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment: 'development' | 'production';
};

async function configuration(): Promise<PipedreamConfig | null> {
  const [clientId, clientSecret, projectId, configuredEnvironment] = await Promise.all([
    getIntegrationSecret('PIPEDREAM_CLIENT_ID'),
    getIntegrationSecret('PIPEDREAM_CLIENT_SECRET'),
    getIntegrationSecret('PIPEDREAM_PROJECT_ID'),
    getIntegrationSecret('PIPEDREAM_ENVIRONMENT'),
  ]);
  if (!clientId || !clientSecret || !projectId) return null;
  return {
    clientId,
    clientSecret,
    projectId,
    environment: configuredEnvironment === 'production' ? 'production' : 'development',
  };
}

async function client() {
  const config = await configuration();
  if (!config) return null;
  return {
    config,
    sdk: new PipedreamClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      projectId: config.projectId,
      projectEnvironment: config.environment,
    }),
  };
}

export async function pipedreamConfigured(): Promise<boolean> {
  return Boolean(await configuration());
}

export function supportsPipedreamProvider(value: string): value is PipedreamMusicProvider {
  return value === 'spotify' || value === 'youtube_music' || value === 'soundcloud';
}

export async function createPipedreamConnectLink(args: {
  profileId: string;
  provider: PipedreamMusicProvider;
  successRedirectUri: string;
  errorRedirectUri: string;
}) {
  const connection = await client();
  if (!connection) throw new Error('Pipedream Connect non configuré');
  const response = await connection.sdk.tokens.create({
    externalUserId: args.profileId,
    expiresIn: 600,
    scope: 'connect:accounts',
    successRedirectUri: args.successRedirectUri,
    errorRedirectUri: args.errorRedirectUri,
  });
  const url = new URL(response.connectLinkUrl);
  url.searchParams.set('connectLink', 'true');
  url.searchParams.set('app', APP_SLUGS[args.provider]);
  return { authorizationUrl: url.toString(), expiresAt: response.expiresAt };
}

export async function listPipedreamMusicAccounts(profileId: string) {
  const connection = await client();
  if (!connection) return [];
  const response = await connection.sdk.accounts.listByExternalUser(profileId, { includeCredentials: false });
  return response.filter((account: any) => Object.values(APP_SLUGS).includes(String(account.app?.nameSlug || account.app?.name_slug || account.app?.id || account.app || '')));
}

export async function findPipedreamMusicAccount(profileId: string, provider: PipedreamMusicProvider) {
  const connection = await client();
  if (!connection) return null;
  const accounts = await connection.sdk.accounts.listByExternalUser(profileId, {
    includeCredentials: false,
    app: APP_SLUGS[provider],
  });
  return accounts[0] ?? null;
}

export async function disconnectPipedreamMusicAccount(profileId: string, provider: PipedreamMusicProvider) {
  const connection = await client();
  if (!connection) throw new Error('Pipedream Connect non configuré');
  const account = await findPipedreamMusicAccount(profileId, provider);
  if (!account?.id) return false;
  await connection.sdk.accounts.delete(account.id);
  return true;
}
