export function openProviderPopup(url: string, name = 'loki-provider'): boolean {
  if (typeof window === 'undefined' || !url) return false;
  const width = Math.min(1180, Math.max(760, window.screen.availWidth - 160));
  const height = Math.min(860, Math.max(620, window.screen.availHeight - 120));
  const left = Math.max(20, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(20, Math.round((window.screen.availHeight - height) / 2));
  const popup = window.open(
    url,
    name,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );
  if (!popup) return false;
  popup.focus();
  return true;
}
