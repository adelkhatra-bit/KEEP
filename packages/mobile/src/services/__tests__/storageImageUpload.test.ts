import fs from 'fs';
import path from 'path';
import {
  STORAGE_IMAGE_RULES,
  VERSIONED_IMAGE_CACHE_CONTROL,
  assertStorageImageSize,
  extensionForMime,
  fitWithin,
  prepareStorageImage,
  storageImageUploadOptions,
  versionedPublicUrl,
} from '../storageImageUpload';

// Faux module natif (expo-image-manipulator) : présent ou absent selon le binaire simulé.
const mockNative = {
  present: true,
  loads: 0,
  savedBytes: 80 * 1024,
  renderFails: false,
  probeSize: { width: 3024, height: 3024 },
  log: { manipulate: [] as unknown[], resize: [] as unknown[], save: [] as unknown[] },
};
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => (mockNative.present && name === 'ExpoImageManipulator' ? {} : null),
}));
jest.mock('expo-image-manipulator', () => {
  mockNative.loads += 1;
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: {
      manipulate(source: unknown) {
        mockNative.log.manipulate.push(source);
        let size = { ...mockNative.probeSize };
        const context = {
          resize(target: { width?: number; height?: number }) {
            mockNative.log.resize.push(target);
            // Comme le vrai module : un seul côté donné, l'autre suit les proportions.
            const ratio = target.width ? target.width / size.width : (target.height ?? size.height) / size.height;
            size = { width: Math.round(size.width * ratio), height: Math.round(size.height * ratio) };
            return context;
          },
          async renderAsync() {
            if (mockNative.renderFails) throw new Error('native render failed');
            return {
              ...size,
              async saveAsync(options: unknown) {
                mockNative.log.save.push(options);
                return { uri: 'file:///cache/resized', ...size };
              },
            };
          },
        };
        return context;
      },
    },
  };
});

// ERR-SUPABASE-EGRESS-IMAGES-20261021 : les images publiques doivent être
// légères AVANT l'envoi et servies avec un cache long versionné.

const MB = 1024 * 1024;
const bytes = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });

describe('storageImageUpload — règles pures', () => {
  it('réduit au plus grand côté sans jamais agrandir', () => {
    expect(fitWithin(2048, 1536, 512)).toEqual({ width: 512, height: 384, scaled: true });
    expect(fitWithin(1080, 1920, 512)).toEqual({ width: 288, height: 512, scaled: true });
    expect(fitWithin(300, 300, 512)).toEqual({ width: 300, height: 300, scaled: false });
    expect(fitWithin(4032, 2268, STORAGE_IMAGE_RULES.event.maxSide)).toEqual({ width: 1600, height: 900, scaled: true });
  });

  it('fixe des tailles adaptées à l’affichage réel', () => {
    expect(STORAGE_IMAGE_RULES.avatar.maxSide).toBeGreaterThanOrEqual(256);
    expect(STORAGE_IMAGE_RULES.avatar.maxSide).toBeLessThanOrEqual(512);
    expect(STORAGE_IMAGE_RULES.event.maxBytes).toBeLessThanOrEqual(5 * MB);
    expect(STORAGE_IMAGE_RULES.payoutQr.prefer).toBe('png');
  });

  it('versionne l’URL publique et garde un cache long', () => {
    expect(versionedPublicUrl('https://x.supabase.co/storage/v1/object/public/avatars/u/avatar.jpg', 42))
      .toBe('https://x.supabase.co/storage/v1/object/public/avatars/u/avatar.jpg?v=42');
    expect(versionedPublicUrl('https://x/a.jpg?t=1', 7)).toBe('https://x/a.jpg?t=1&v=7');
    expect(Number(VERSIONED_IMAGE_CACHE_CONTROL)).toBeGreaterThanOrEqual(7 * 24 * 3600);
    expect(storageImageUploadOptions({ mime: 'image/jpeg' })).toEqual({ upsert: true, contentType: 'image/jpeg', cacheControl: VERSIONED_IMAGE_CACHE_CONTROL });
  });

  it('refuse une image trop lourde avec un message clair', () => {
    expect(() => assertStorageImageSize(6 * MB, 'event')).toThrow(/trop lourde \(6,0 Mo, maximum 5,0 Mo\)/);
    expect(() => assertStorageImageSize(1 * MB, 'event')).not.toThrow();
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/webp')).toBe('webp');
    expect(extensionForMime('image/jpeg')).toBe('jpg');
  });
});

describe('storageImageUpload — iPhone/Android (pas de canvas)', () => {
  it('garde la photo du sélecteur natif telle quelle', async () => {
    const original = bytes(700 * 1024, 'image/jpeg');
    const prepared = await prepareStorageImage(original, 'avatar', 'image/jpeg');
    expect(prepared.optimized).toBe(false);
    expect(prepared.blob).toBe(original);
    expect(prepared.extension).toBe('jpg');
  });

  it('applique quand même la limite explicite de poids', async () => {
    await expect(prepareStorageImage(bytes(6 * MB, 'image/jpeg'), 'event', 'image/jpeg')).rejects.toThrow(/trop lourde/);
  });
});

describe('storageImageUpload — PC/web (canvas)', () => {
  const g = global as any;
  let encodedSize = 40 * 1024;
  let drawn: { width: number; height: number } | null = null;
  let encodedTypes: string[] = [];

  beforeEach(() => {
    encodedSize = 40 * 1024;
    drawn = null;
    encodedTypes = [];
    g.createImageBitmap = jest.fn(async () => ({ width: 2048, height: 2048, close: jest.fn() }));
    g.document = {
      createElement: (tag: string) => {
        expect(tag).toBe('canvas');
        const canvas: any = {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: (_s: unknown, _x: number, _y: number, w: number, h: number) => { drawn = { width: w, height: h }; },
            getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
          }),
          toBlob: (cb: (b: Blob | null) => void, type: string) => { encodedTypes.push(type); cb(bytes(encodedSize, type)); },
        };
        return canvas;
      },
    };
    g.URL.createObjectURL = jest.fn(() => 'blob:test');
    g.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    delete g.document;
    delete g.createImageBitmap;
  });

  it('réduit un avatar PNG de 2,2 Mo à 512 px en JPEG léger', async () => {
    const prepared = await prepareStorageImage(bytes(2.2 * MB, 'image/png'), 'avatar', 'image/png');
    expect(drawn).toEqual({ width: 512, height: 512 });
    expect(encodedTypes).toEqual(['image/jpeg']);
    expect(prepared.optimized).toBe(true);
    expect(prepared.mime).toBe('image/jpeg');
    expect(prepared.extension).toBe('jpg');
    expect(prepared.finalBytes).toBe(40 * 1024);
  });

  it('garde un QR en PNG net', async () => {
    const prepared = await prepareStorageImage(bytes(400 * 1024, 'image/png'), 'payoutQr', 'image/png');
    expect(encodedTypes).toEqual(['image/png']);
    expect(drawn).toEqual({ width: 1600, height: 1600 });
    expect(prepared.extension).toBe('png');
  });

  it('garde l’original si le réencodage ne fait rien gagner', async () => {
    encodedSize = 900 * 1024;
    const original = bytes(300 * 1024, 'image/jpeg');
    const prepared = await prepareStorageImage(original, 'avatar', 'image/jpeg');
    expect(prepared.blob).toBe(original);
    expect(prepared.optimized).toBe(false);
  });

  it('ne bloque pas l’envoi si le navigateur ne sait pas décoder (repli original)', async () => {
    g.createImageBitmap = jest.fn(async () => { throw new Error('unsupported'); });
    g.Image = class { onload: any; onerror: any; set src(_v: string) { setTimeout(() => this.onerror?.(), 0); } };
    const original = bytes(500 * 1024, 'image/heic');
    const prepared = await prepareStorageImage(original, 'avatar', 'image/heic');
    expect(prepared.blob).toBe(original);
    delete g.Image;
  });
});

describe('storageImageUpload — iPhone/Android avec expo-image-manipulator (préparé, pas encore dans un binaire)', () => {
  const g = global as any;
  const realFetch = g.fetch;
  type Mod = typeof import('../storageImageUpload');
  let mod: Mod;
  // Module chargé à neuf avant chaque test : on vérifie aussi que le paquet
  // expo-image-manipulator n'est jamais chargé quand le binaire ne le contient pas.
  const load = (): Mod => mod;

  const pickerBlob = bytes(1.5 * MB, 'image/jpeg');

  beforeEach(() => {
    mockNative.present = true;
    mockNative.loads = 0;
    mockNative.log = { manipulate: [], resize: [], save: [] };
    mockNative.savedBytes = 80 * 1024;
    mockNative.renderFails = false;
    mockNative.probeSize = { width: 3024, height: 3024 };
    jest.resetModules();
    mod = require('../storageImageUpload');
    g.fetch = jest.fn(async (uri: string) => ({
      ok: true,
      blob: async () => (uri === 'file:///cache/resized' ? bytes(mockNative.savedBytes, 'image/jpeg') : pickerBlob),
    }));
  });

  afterEach(() => {
    g.fetch = realFetch;
  });

  it('réduit un avatar iPhone de 3024 px à 512 px en JPEG avant envoi', async () => {
    const { prepareStorageImageFromAsset } = load();
    const prepared = await prepareStorageImageFromAsset({ uri: 'file:///picker/a.jpg', mimeType: 'image/jpeg', width: 3024, height: 3024 }, 'avatar');
    expect(mockNative.log.resize).toEqual([{ width: 512 }]);
    expect(mockNative.log.save).toEqual([{ compress: STORAGE_IMAGE_RULES.avatar.quality, format: 'jpeg' }]);
    expect(prepared).toMatchObject({ mime: 'image/jpeg', extension: 'jpg', optimized: true, finalBytes: 80 * 1024, width: 512, height: 512 });
  });

  it('image de soirée en portrait : le plus grand côté passe à 1600 px', async () => {
    const { prepareStorageImageFromAsset } = load();
    await prepareStorageImageFromAsset({ uri: 'file:///picker/e.jpg', mimeType: 'image/jpeg', width: 2268, height: 4032 }, 'event');
    expect(mockNative.log.resize).toEqual([{ height: 1600 }]);
  });

  it('garde le QR PayPal en PNG sans perte', async () => {
    const { prepareStorageImageFromAsset } = load();
    const prepared = await prepareStorageImageFromAsset({ uri: 'file:///picker/qr.png', mimeType: 'image/png', width: 2400, height: 2400 }, 'payoutQr');
    expect(mockNative.log.resize).toEqual([{ width: 1600 }]);
    expect(mockNative.log.save).toEqual([{ compress: 1, format: 'png' }]);
    expect(prepared).toMatchObject({ mime: 'image/png', extension: 'png' });
  });

  it('une photo déjà petite reste exactement celle du sélecteur (aucun réencodage)', async () => {
    const { prepareStorageImageFromAsset } = load();
    const prepared = await prepareStorageImageFromAsset({ uri: 'file:///picker/s.jpg', mimeType: 'image/jpeg', width: 400, height: 400 }, 'avatar');
    expect(mockNative.log.manipulate).toEqual([]);
    expect(prepared.blob).toBe(pickerBlob);
    expect(prepared.optimized).toBe(false);
  });

  it('dimensions inconnues (avatar local) : un premier rendu donne la vraie taille', async () => {
    const { prepareStorageImageFromAsset } = load();
    mockNative.probeSize = { width: 2048, height: 1536 };
    await prepareStorageImageFromAsset({ uri: 'file:///local/avatar.jpg' }, 'avatar');
    expect(mockNative.log.manipulate[0]).toBe('file:///local/avatar.jpg');
    expect(mockNative.log.manipulate).toHaveLength(2);
    expect(mockNative.log.resize).toEqual([{ width: 512 }]);
  });

  it('binaire actuel (module natif absent) : comportement inchangé, le module n’est jamais chargé', async () => {
    mockNative.present = false;
    const { prepareStorageImageFromAsset, nativeImageManipulator } = load();
    expect(nativeImageManipulator()).toBeNull();
    const prepared = await prepareStorageImageFromAsset({ uri: 'file:///picker/a.jpg', mimeType: 'image/jpeg', width: 3024, height: 3024 }, 'avatar');
    expect(prepared.blob).toBe(pickerBlob);
    expect(prepared.optimized).toBe(false);
    expect(mockNative.loads).toBe(0);
  });

  it('échec de la réduction native : repli sur la photo du sélecteur, l’envoi continue', async () => {
    const { prepareStorageImageFromAsset } = load();
    mockNative.renderFails = true;
    const prepared = await prepareStorageImageFromAsset({ uri: 'file:///picker/a.jpg', mimeType: 'image/jpeg', width: 3024, height: 3024 }, 'avatar');
    expect(prepared.blob).toBe(pickerBlob);
  });

  it('la limite de poids reste appliquée après réduction native', async () => {
    const { prepareStorageImageFromAsset } = load();
    mockNative.savedBytes = 6 * MB;
    await expect(prepareStorageImageFromAsset({ uri: 'file:///picker/e.jpg', mimeType: 'image/jpeg', width: 4032, height: 3024 }, 'event')).rejects.toThrow(/trop lourde/);
  });

  it('le lecteur de l’appelant est utilisé pour le repli (vérification de lecture conservée)', async () => {
    mockNative.present = false;
    const { prepareStorageImageFromAsset } = load();
    const own = bytes(200 * 1024, 'image/jpeg');
    const reader = jest.fn(async () => own);
    const prepared = await prepareStorageImageFromAsset({ uri: 'data:image/jpeg;base64,AAAA' }, 'avatar', reader);
    expect(reader).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA');
    expect(prepared.blob).toBe(own);
  });

  it('PC/web : jamais de module natif, le canvas reste le seul chemin', () => {
    const { nativeImageManipulator } = load();
    g.document = {};
    try {
      expect(nativeImageManipulator()).toBeNull();
    } finally {
      delete g.document;
    }
  });
});

describe('contrat — toutes les images publiques passent par la source unique', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const uploads = ['avatarService.ts', 'profileService.ts', 'creatorEventService.ts', 'payoutLinkService.ts'];

  it.each(uploads)('%s prépare l’image et utilise le cache versionné', (file) => {
    const source = read(file);
    expect(source).toContain("from './storageImageUpload'");
    expect(source).toMatch(/prepareStorageImageFromAsset\((asset|\{ uri: avatar \}), '(avatar|event|payoutQr)'/);
    expect(source).not.toContain('await fetch(asset.uri)');
    expect(source).toContain('storageImageUploadOptions(prepared)');
    expect(source).toContain('versionedPublicUrl(data.publicUrl)');
    expect(source).not.toMatch(/cacheControl:\s*'3600'/);
  });

  it('expo-image-manipulator n’est jamais importé directement (binaire 445 sans module natif)', () => {
    const srcRoot = path.resolve(__dirname, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/from ['"]expo-image-manipulator['"]/.test(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(srcRoot, full));
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
    const lib = read('storageImageUpload.ts');
    expect(lib).toContain("requireOptionalNativeModule?.('ExpoImageManipulator')");
    const pkg = JSON.parse(fs.readFileSync(path.resolve(srcRoot, '..', 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-image-manipulator']).toBe('~14.0.8');
  });

  it('les sélecteurs natifs prennent la qualité dans les règles communes', () => {
    expect(read('avatarService.ts')).toContain("quality: storageImageRule('avatar').pickerQuality");
    expect(read('creatorEventService.ts')).toContain("quality: storageImageRule('event').pickerQuality");
    expect(read('payoutLinkService.ts')).toContain("quality: storageImageRule('payoutQr').pickerQuality");
  });
});
