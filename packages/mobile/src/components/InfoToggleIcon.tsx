import React from 'react';

// Sans dépendance native : le même symbole est utilisé dans l'app et le Super Admin.
export default function InfoToggleIcon({ expanded = false }: { expanded?: boolean }) {
  return <>{expanded ? '✕' : 'ⓘ'}</>;
}
