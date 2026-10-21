// Source unique de préparation des images publiques envoyées vers Supabase
// Storage (avatars, images de soirée, QR PayPal).
//
// Pourquoi (ERR-SUPABASE-EGRESS-IMAGES-20261021) : le trafic « Cached Egress »
// du projet venait presque entièrement de quelques images publiques trop
// lourdes (avatar PNG de 2,19 Mo affiché en 40-120 px, image de soirée de
// 4,4 Mo…). Chaque affichage sur un appareil sans cache retéléchargeait le
// fichier complet ; sur iPhone, une réponse de plus d'environ 5 % du cache
// disque (≈ 0,5 Mo par défaut) n'est même pas mise en cache par le système,
// donc l'app la retélécharge à chaque montage d'écran.
//
// Règles :
// - une image est réduite AVANT l'envoi (PC/web : canvas, côté navigateur) ;
// - sur iPhone/Android, le sélecteur photo recadre et compresse ; la réduction
//   en pixels passe par `expo-image-manipulator` dès qu'un binaire le contient
//   (prochain build, GO d'Adel) — sur un binaire plus ancien, repli automatique ;
// - une limite de poids explicite protège chaque type d'image ;
// - l'URL publique est versionnée (?v=…) à chaque envoi : on peut donc
//   demander un cache long sans risque d'afficher une ancienne photo.
// Aucune donnée n'est supprimée ici et le chemin Storage ne change pas.

export type StorageImageKind = 'avatar' | 'event' | 'payoutQr';

export type StorageImageRule = {
  /** Plus grand côté conservé, en pixels, quand l'appareil sait redimensionner. */
  maxSide: number;
  /** Qualité JPEG/WebP visée (0-1). */
  quality: number;
  /** Format préféré : `jpeg` pour les photos, `png` pour les QR (net, sans artefact). */
  prefer: 'jpeg' | 'png';
  /** Qualité demandée au sélecteur photo natif (iPhone/Android). */
  pickerQuality: number;
  /** Poids maximum accepté après préparation (octets). */
  maxBytes: number;
  /** Libellé utilisé dans les messages d'erreur. */
  label: string;
};

const MB = 1024 * 1024;

export const STORAGE_IMAGE_RULES: Record<StorageImageKind, StorageImageRule> = {
  // Affiché au plus en ~120 px (×3 sur iPhone) : 512 px suffisent largement.
  avatar: { maxSide: 512, quality: 0.82, prefer: 'jpeg', pickerQuality: 0.6, maxBytes: 4 * MB, label: 'La photo de profil' },
  // Bannière de soirée en pleine largeur (1440 px sur PC) : 1600 px suffisent.
  event: { maxSide: 1600, quality: 0.8, prefer: 'jpeg', pickerQuality: 0.65, maxBytes: 5 * MB, label: "L'image de la soirée" },
  // Un QR doit rester parfaitement net : PNG sans perte, réduit à 1600 px (capture d'écran PayPal lisible).
  payoutQr: { maxSide: 1600, quality: 1, prefer: 'png', pickerQuality: 0.9, maxBytes: 2 * MB, label: 'Le QR PayPal' },
};

/**
 * Cache navigateur/CDN des images publiques versionnées : 30 jours.
 * Sûr parce que chaque nouvel envoi produit une nouvelle URL (?v=…) ;
 * auparavant 3600 s, ce qui forçait un retéléchargement toutes les heures.
 */
export const VERSIONED_IMAGE_CACHE_CONTROL = '2592000';

export type PreparedStorageImage = {
  blob: Blob;
  mime: string;
  extension: 'jpg' | 'png' | 'webp';
  originalBytes: number;
  finalBytes: number;
  /** true si l'image a été réellement réduite/réencodée sur cet appareil. */
  optimized: boolean;
  width?: number;
  height?: number;
};

export function storageImageRule(kind: StorageImageKind): StorageImageRule {
  return STORAGE_IMAGE_RULES[kind];
}

/** Dimensions finales en gardant les proportions (jamais d'agrandissement). */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number; scaled: boolean } {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const longest = Math.max(w, h);
  if (!Number.isFinite(maxSide) || maxSide <= 0 || longest <= maxSide) return { width: w, height: h, scaled: false };
  const ratio = maxSide / longest;
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)), scaled: true };
}

export function extensionForMime(mime: string): 'jpg' | 'png' | 'webp' {
  const value = String(mime || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  return 'jpg';
}

export function formatMegabytes(bytes: number): string {
  return `${(Math.max(0, bytes) / MB).toFixed(1).replace('.', ',')} Mo`;
}

/** Refuse explicitement une image trop lourde (message en français pour l'utilisateur). */
export function assertStorageImageSize(bytes: number, kind: StorageImageKind): void {
  const rule = storageImageRule(kind);
  if (Number.isFinite(bytes) && bytes > rule.maxBytes) {
    throw new Error(`${rule.label} est trop lourde (${formatMegabytes(bytes)}, maximum ${formatMegabytes(rule.maxBytes)}). Choisis une image plus légère ou recadre-la.`);
  }
}

/** URL publique versionnée : chaque envoi change l'URL, donc le cache long reste correct. */
export function versionedPublicUrl(publicUrl: string, now: number = Date.now()): string {
  const base = String(publicUrl || '');
  return `${base}${base.includes('?') ? '&' : '?'}v=${now}`;
}

/** Options communes d'envoi Storage pour une image publique préparée. */
export function storageImageUploadOptions(prepared: Pick<PreparedStorageImage, 'mime'>) {
  return { upsert: true, contentType: prepared.mime, cacheControl: VERSIONED_IMAGE_CACHE_CONTROL };
}

type DecodedImage = { source: CanvasImageSource; width: number; height: number; close: () => void };

function canResizeHere(): boolean {
  return typeof document !== 'undefined'
    && typeof document.createElement === 'function'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function';
}

async function decodeOnWeb(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      // Navigateur ancien ou format non géré par createImageBitmap : repli <img>.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => resolve(blob), type, quality);
        return;
      }
      const dataUrl = canvas.toDataURL(type, quality);
      fetch(dataUrl).then((r) => r.blob()).then(resolve, () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = context.getImageData(0, 0, width, height);
    // Échantillonnage : un pixel sur 7 suffit pour détecter un fond transparent.
    for (let i = 3; i < data.length; i += 28) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function resizeOnWeb(blob: Blob, sourceMime: string, rule: StorageImageRule): Promise<PreparedStorageImage | null> {
  const decoded = await decodeOnWeb(blob);
  try {
    const target = fitWithin(decoded.width, decoded.height, rule.maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    (context as any).imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, target.width, target.height);

    let output: Blob | null = null;
    if (rule.prefer === 'png') {
      output = await canvasToBlob(canvas, 'image/png', 1);
    } else {
      const mayBeTransparent = /png|webp|gif/i.test(sourceMime);
      if (mayBeTransparent && hasTransparency(context, target.width, target.height)) {
        // Fond transparent : WebP garde la transparence ; sinon PNG.
        const webp = await canvasToBlob(canvas, 'image/webp', rule.quality);
        output = webp && webp.type === 'image/webp' ? webp : await canvasToBlob(canvas, 'image/png', 1);
      } else {
        output = await canvasToBlob(canvas, 'image/jpeg', rule.quality);
      }
    }
    if (!output || !output.size) return null;
    const mime = output.type || (rule.prefer === 'png' ? 'image/png' : 'image/jpeg');
    return {
      blob: output,
      mime,
      extension: extensionForMime(mime),
      originalBytes: blob.size,
      finalBytes: output.size,
      optimized: true,
      width: target.width,
      height: target.height,
    };
  } finally {
    decoded.close();
  }
}

// ─── iPhone / Android : réduction native (expo-image-manipulator) ───────────
// Le module natif n'existe que dans les binaires construits APRÈS son ajout
// (prochain build, GO d'Adel). Sur un binaire plus ancien (ex. 445), il est
// absent : on le détecte sans jamais importer le module (son import échouerait)
// et on garde le comportement actuel (photo du sélecteur + limite de poids).

type NativeManipulatorModule = {
  ImageManipulator: { manipulate(source: unknown): NativeManipulatorContext };
  SaveFormat: { JPEG: string; PNG: string };
};
type NativeManipulatorContext = {
  resize(size: { width?: number | null; height?: number | null }): NativeManipulatorContext;
  renderAsync(): Promise<NativeImageRef>;
};
type NativeImageRef = {
  width: number;
  height: number;
  saveAsync(options?: { compress?: number; format?: string }): Promise<{ uri: string; width: number; height: number }>;
};

export function nativeImageManipulator(): NativeManipulatorModule | null {
  if (typeof document !== 'undefined') return null; // PC/web : le canvas suffit
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require('expo');
    if (!requireOptionalNativeModule?.('ExpoImageManipulator')) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-image-manipulator') as NativeManipulatorModule;
  } catch {
    return null;
  }
}

export type PickedImageAsset = {
  uri: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
};

async function readBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

async function resizeOnNative(asset: PickedImageAsset, sourceMime: string, kind: StorageImageKind, manipulator: NativeManipulatorModule): Promise<PreparedStorageImage | null> {
  const rule = storageImageRule(kind);
  let width = Number(asset.width) || 0;
  let height = Number(asset.height) || 0;
  let source: unknown = asset.uri;
  if (!width || !height) {
    // Dimensions inconnues (avatar local) : un premier rendu donne la taille réelle.
    const probe = await manipulator.ImageManipulator.manipulate(asset.uri).renderAsync();
    width = probe.width;
    height = probe.height;
    source = probe;
  }
  const target = fitWithin(width, height, rule.maxSide);
  // Image déjà assez petite : on garde exactement la photo du sélecteur
  // (comportement actuel), sans réencodage inutile qui pourrait l'alourdir.
  if (!target.scaled) return null;
  const context = manipulator.ImageManipulator.manipulate(source);
  context.resize(width >= height ? { width: target.width } : { height: target.height });
  // Une source PNG reste PNG (transparence d'un logo préservée) ; les photos passent en JPEG.
  const keepPng = rule.prefer === 'png' || /png/i.test(sourceMime);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: keepPng ? 1 : rule.quality,
    format: keepPng ? manipulator.SaveFormat.PNG : manipulator.SaveFormat.JPEG,
  });
  const blob = await readBlob(saved.uri);
  if (!blob.size) return null;
  const mime = keepPng ? 'image/png' : 'image/jpeg';
  return {
    blob,
    mime,
    extension: extensionForMime(mime),
    originalBytes: 0, // inconnu sans relire l'original (évité volontairement : mémoire du téléphone)
    finalBytes: blob.size,
    optimized: true,
    width: saved.width,
    height: saved.height,
  };
}

/**
 * Point d'entrée des sélecteurs photo (avatar, soirée, QR) :
 * - PC/web : réduction canvas (prepareStorageImage) ;
 * - iPhone/Android avec module natif : réduction en pixels avant envoi ;
 * - iPhone/Android sans module (binaire ancien) : photo du sélecteur + limite.
 * `readSource` permet à l'appelant de garder sa propre vérification de lecture
 * (ex. profileService.persistLocalAvatar).
 */
export async function prepareStorageImageFromAsset(
  asset: PickedImageAsset,
  kind: StorageImageKind,
  readSource: (uri: string) => Promise<Blob> = readBlob,
): Promise<PreparedStorageImage> {
  const manipulator = nativeImageManipulator();
  const sourceMime = String(asset.mimeType || '');
  if (manipulator) {
    try {
      const resized = await resizeOnNative(asset, sourceMime || 'image/jpeg', kind, manipulator);
      if (resized) {
        assertStorageImageSize(resized.finalBytes, kind);
        return resized;
      }
    } catch (error) {
      if (error instanceof Error && /trop lourde/.test(error.message)) throw error;
      // Échec de la réduction native : on retombe sur le chemin actuel, sans bloquer l'envoi.
    }
  }
  const blob = await readSource(asset.uri);
  return prepareStorageImage(blob, kind, sourceMime || blob.type || null);
}

/**
 * Prépare une image avant son envoi public vers Storage.
 * - PC/web : réduction au plus grand côté autorisé + réencodage léger.
 * - iPhone/Android : image du sélecteur conservée (déjà recadrée/compressée).
 * Si la réduction échoue ou n'apporte rien, l'original est gardé ; dans tous
 * les cas la limite de poids explicite s'applique.
 */
export async function prepareStorageImage(blob: Blob, kind: StorageImageKind, sourceMime?: string | null): Promise<PreparedStorageImage> {
  const rule = storageImageRule(kind);
  const mime = String(sourceMime || blob.type || (rule.prefer === 'png' ? 'image/png' : 'image/jpeg'));
  const original: PreparedStorageImage = {
    blob,
    mime,
    extension: extensionForMime(mime),
    originalBytes: blob.size,
    finalBytes: blob.size,
    optimized: false,
  };

  let prepared = original;
  if (canResizeHere() && /^image\//i.test(mime) && !/svg/i.test(mime)) {
    try {
      const resized = await resizeOnWeb(blob, mime, rule);
      if (resized && resized.finalBytes < blob.size) prepared = resized;
    } catch {
      prepared = original;
    }
  }
  assertStorageImageSize(prepared.finalBytes, kind);
  return prepared;
}
