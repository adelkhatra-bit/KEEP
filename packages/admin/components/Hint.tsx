import React, { useEffect, useState } from 'react';

/**
 * Règle Adel (07/10/2026) : un seul mot à l'écran, l'explication derrière un « ? ».
 * Composant UNIQUE pour tout le Super Admin : `Hint` (le « ? ») et `Sheet` (la fenêtre, réutilisée par la confirmation).
 * La fenêtre défile elle-même (jamais le fond), se ferme par ✕, Échap ou un clic à côté, et reste lisible sur 390 px.
 */
export function Sheet({ title, children, onClose, actions }: {
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="sheet-backdrop">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{title}</strong>
          <button type="button" className="btn sheet-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </div>
  );
}

export default function Hint({ text, title = 'À savoir' }: { text: React.ReactNode; title?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="hint" aria-label={`Explication : ${typeof title === 'string' ? title : 'aide'}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>?</button>
    {open && <Sheet title={title} onClose={() => setOpen(false)}
      actions={<button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Compris</button>}>
      {text}
    </Sheet>}
  </>;
}
