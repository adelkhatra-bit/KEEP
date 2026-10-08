/** Presentation only: keep stored identities, routes and email addresses unchanged. */
export function displayUsername(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/^(?:@\s*)+/, '');
}
