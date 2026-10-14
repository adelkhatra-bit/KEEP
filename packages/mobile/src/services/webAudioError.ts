/** Distinguish a browser autoplay permission from an actually unreadable file.
 * Only a denied user gesture should ask the listener to tap Play. A 404,
 * unsupported codec or unreachable media must not freeze the Swipe on web.
 */
export function isWebAudioGestureRequired(error: unknown): boolean {
  const candidate = error as { name?: string; message?: string } | null;
  const name = String(candidate?.name || '').toLowerCase();
  const message = String(candidate?.message || error || '').toLowerCase();
  return name === 'notallowederror'
    || /(?:notallowederror|user.{0,80}(?:interact|gesture|activation|click)|autoplay\s*(?:blocked|denied|policy)|play\(\).*not allowed|playback\s*not\s*allowed)/i.test(message);
}
