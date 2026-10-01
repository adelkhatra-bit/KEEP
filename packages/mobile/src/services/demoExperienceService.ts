import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const DEMO_LISTEN_USED_KEY = '@keep/demo-listen-used-v1';
const CONFIG_TTL_MS = 60_000;

export type DemoExperienceConfig = {
  listenLimit: number;
  discoveryLocked: boolean;
};

export type DemoListenStatus = {
  used: number;
  limit: number;
  remaining: number;
};

const DEFAULT_CONFIG: DemoExperienceConfig = {
  listenLimit: 8,
  discoveryLocked: true,
};

let configCache: { value: DemoExperienceConfig; loadedAt: number } | null = null;

function scalar(value: unknown): unknown {
  if (value && typeof value === 'object' && 'value' in (value as any)) return (value as any).value;
  return value;
}

function positiveInt(value: unknown, fallback: number): number {
  const number = Number(scalar(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(100, Math.floor(number))) : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  const raw = scalar(value);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
  }
  return fallback;
}

export async function loadDemoExperienceConfig(force = false): Promise<DemoExperienceConfig> {
  if (!force && configCache && Date.now() - configCache.loadedAt < CONFIG_TTL_MS) return configCache.value;
  let value = { ...DEFAULT_CONFIG };
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('remote_config')
        .select('key,value')
        .in('key', ['demo_listen_limit', 'demo_discovery_locked']);
      if (!error && Array.isArray(data)) {
        for (const row of data as any[]) {
          if (row.key === 'demo_listen_limit') value.listenLimit = positiveInt(row.value, value.listenLimit);
          if (row.key === 'demo_discovery_locked') value.discoveryLocked = boolValue(row.value, value.discoveryLocked);
        }
      }
    }
  } catch {
    // Demo must remain usable even when remote config cannot be reached.
  }
  configCache = { value, loadedAt: Date.now() };
  return value;
}

async function readUsed(): Promise<number> {
  try {
    const raw = Number(await AsyncStorage.getItem(DEMO_LISTEN_USED_KEY));
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  } catch {
    return 0;
  }
}

export async function getDemoListenStatus(forceConfig = false): Promise<DemoListenStatus> {
  const [config, usedRaw] = await Promise.all([loadDemoExperienceConfig(forceConfig), readUsed()]);
  const used = Math.min(usedRaw, config.listenLimit);
  return { used, limit: config.listenLimit, remaining: Math.max(0, config.listenLimit - used) };
}

export async function consumeDemoListen(): Promise<DemoListenStatus> {
  const status = await getDemoListenStatus();
  if (status.remaining <= 0) return status;
  const used = Math.min(status.limit, status.used + 1);
  try { await AsyncStorage.setItem(DEMO_LISTEN_USED_KEY, String(used)); } catch {}
  return { used, limit: status.limit, remaining: Math.max(0, status.limit - used) };
}

export async function isDemoDiscoveryLocked(): Promise<boolean> {
  return (await loadDemoExperienceConfig()).discoveryLocked;
}

export const DEMO_EXPERIENCE_DEFAULTS = DEFAULT_CONFIG;
