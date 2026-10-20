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

describe('contrat — toutes les images publiques passent par la source unique', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const uploads = ['avatarService.ts', 'profileService.ts', 'creatorEventService.ts', 'payoutLinkService.ts'];

  it.each(uploads)('%s prépare l’image et utilise le cache versionné', (file) => {
    const source = read(file);
    expect(source).toContain("from './storageImageUpload'");
    expect(source).toMatch(/prepareStorageImage\(blob, '(avatar|event|payoutQr)'/);
    expect(source).toContain('storageImageUploadOptions(prepared)');
    expect(source).toContain('versionedPublicUrl(data.publicUrl)');
    expect(source).not.toMatch(/cacheControl:\s*'3600'/);
  });

  it('les sélecteurs natifs prennent la qualité dans les règles communes', () => {
    expect(read('avatarService.ts')).toContain("quality: storageImageRule('avatar').pickerQuality");
    expect(read('creatorEventService.ts')).toContain("quality: storageImageRule('event').pickerQuality");
    expect(read('payoutLinkService.ts')).toContain("quality: storageImageRule('payoutQr').pickerQuality");
  });
});
